import {
  Stock,
  Process,
  ProcessList,
  InstructionDict,
  GoodInstruction,
  TodoList
} from './types';
import { ScenarioAnalyzer, StockManager } from './utils';
import * as cliProgress from 'cli-progress';

/**
 * MainWalk - Core optimization algorithm for resource planning
 * Uses a combination of greedy approach and deterministic planning
 * to find optimal process execution sequence
 */
export class MainWalk {
  private optimizationTarget: string; // Target resource to maximize
  private processList: ProcessList; // All available processes
  private maxInstructions: number; // Maximum allowed instructions
  private maxDelay: number; // Maximum time limit
  private currentStock: Stock; // Current resource state
  private updatedStock: Stock; // Updated resource state after execution
  private requiredStock: Stock; // Resources needed for planned processes
  private instructionDict: InstructionDict; // Planned process execution counts
  private fileName: string; // Configuration file name
  public goodInstructions: GoodInstruction[]; // Final execution plan
  public score: number; // Optimization score (target/time)
  public created: number; // Amount of target resource created
  public loop: boolean; // Whether system can continue running

  constructor(
    initialStock: Stock,
    optimizationTarget: string,
    processList: ProcessList,
    maxCycle: number,
    maxInstructions: number,
    maxDelay: number,
    fileName: string
  ) {
    this.optimizationTarget = optimizationTarget;
    this.processList = processList;
    this.maxInstructions = maxInstructions;
    this.maxDelay = maxDelay;
    this.fileName = fileName;
    this.currentStock = { ...initialStock };
    this.updatedStock = { ...initialStock };
    this.requiredStock = {};
    this.instructionDict = {};
    this.goodInstructions = [];
    this.score = 0;
    this.created = 0;
    this.loop = true;

    // Step 1: Plan which processes to execute (instructionDict)
    this.retrieveInstructions(processList);
    // Step 2: Execute the plan and create final schedule
    this.finalizeProcess(maxCycle, initialStock);
    // Step 3: Calculate optimization score
    this.calculateScore(initialStock);
  }

  /**
   * Check if this is a complex scenario (like inception)
   * Complex scenarios need special handling for optimal results
   */
  private isComplexScenario(): boolean {
    return ScenarioAnalyzer.isComplexScenario(this.processList);
  }

  /**
   * Calculate optimization score: target_resource / total_cycles
   * Higher score = better optimization
   */
  private calculateScore(initialStock: Stock): void {
    this.created = this.updatedStock[this.optimizationTarget] || 0;

    if (
      !this.goodInstructions.length ||
      this.goodInstructions[this.goodInstructions.length - 1].cycle === 0
    ) {
      this.score = 0;
    } else {
      // Score = amount of target resource / total time taken
      this.score =
        this.created /
        this.goodInstructions[this.goodInstructions.length - 1].cycle;
    }

    // Check if system can continue running (has resources)
    if (
      !this.goodInstructions.length ||
      Object.keys(initialStock).some(
        (key) => (this.updatedStock[key] || 0) < initialStock[key]
      ) ||
      !this.goodInstructions[0].processes.length
    ) {
      this.loop = false;
    }
  }

  /**
   * Execute the planned processes and create final schedule
   * This converts instructionDict into actual execution timeline
   */
  private finalizeProcess(
    maxCycle: number,
    initialStock: Stock
  ): GoodInstruction[] {
    let currentCycle = 0;

    // Get initial processes that can run immediately
    const possibleProcesses = this.finalizePossibleProcesses(
      initialStock,
      this.instructionDict
    );
    this.goodInstructions = [
      { cycle: currentCycle, processes: possibleProcesses }
    ];

    // Schedule when processes will complete
    let todoList = this.updateProcessList(currentCycle, possibleProcesses, {});

    // Main execution loop: process completions and start new processes
    while (Object.keys(todoList).length > 0 && currentCycle <= maxCycle) {
      currentCycle = Math.min(...Object.keys(todoList).map(Number));

      // Check if the next process exceeds the time limit
      if (currentCycle > this.maxDelay) {
        break;
      }

      // Complete finished processes and add their outputs to stock
      for (const processName of todoList[currentCycle]) {
        StockManager.update(
          this.updatedStock,
          this.processList[processName].result,
          '+'
        );
      }
      delete todoList[currentCycle];

      // Find new processes that can now run with updated resources
      const possibleProcesses = this.finalizePossibleProcesses(
        initialStock,
        this.instructionDict
      );
      this.goodInstructions.push({
        cycle: currentCycle,
        processes: possibleProcesses
      });

      // Schedule completion times for newly started processes
      todoList = this.updateProcessList(
        currentCycle,
        possibleProcesses,
        todoList
      );
    }
    return this.goodInstructions;
  }

  /**
   * Determine which processes can run at current cycle
   * Uses different strategies for complex vs simple scenarios
   */
  private finalizePossibleProcesses(
    initialStock: Stock,
    instructionDict: InstructionDict
  ): string[] {
    const processesCycle: string[] = [];

    // Strategy 1: For complex scenarios - conversion-first approach
    if (this.isComplexScenario()) {
      // Build closure of needed resources (what we need to produce)
      const needClosure = new Set<string>();
      const seedNeeds: string[] = [];
      for (const [pname, remaining] of Object.entries(instructionDict)) {
        if (!remaining || remaining <= 0) continue;
        for (const need of Object.keys(this.processList[pname].need))
          seedNeeds.push(need);
      }
      for (const n of seedNeeds) needClosure.add(n);

      // Expand needs closure to find all required resources
      const maxDepth = 3; // small bounded expansion
      for (let d = 0; d < maxDepth; d++) {
        const toAdd: string[] = [];
        for (const res of Array.from(needClosure)) {
          for (const proc of Object.values(this.processList)) {
            if (res in proc.result) {
              for (const inp of Object.keys(proc.need)) toAdd.push(inp);
            }
          }
        }
        for (const r of toAdd) needClosure.add(r);
      }

      // Run fast conversion processes first (shortest delays)
      let progressed = true;
      while (progressed) {
        progressed = false;
        const conversions = Object.entries(this.processList)
          .filter(
            ([name, proc]) =>
              !processesCycle.includes(name) &&
              Object.keys(proc.result).some((r) => needClosure.has(r))
          )
          .sort((a, b) => a[1].delay - b[1].delay); // Sort by delay (fastest first)

        for (const [name, proc] of conversions) {
          let ok = true;
          for (const [need, qty] of Object.entries(proc.need)) {
            if ((this.updatedStock[need] || 0) < qty) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          if (this.finalizeProcessIfPossible(name)) {
            processesCycle.push(name);
            progressed = true;
            break; // re-evaluate after each
          }
        }
      }
    }

    // Strategy 2: Execute planned processes from instructionDict
    for (const key of Object.keys(instructionDict).sort((a, b) =>
      b.localeCompare(a)
    )) {
      let count = instructionDict[key];
      while (count > 0 && this.finalizeProcessIfPossible(key)) {
        processesCycle.push(key);
        instructionDict[key]--;
        count--;
      }
    }

    // Strategy 3: Fallback - any process that produces still-needed resources
    if (this.isComplexScenario()) {
      const stillNeeded = new Set<string>();
      for (const [pname, remaining] of Object.entries(instructionDict)) {
        if (!remaining || remaining <= 0) continue;
        for (const need of Object.keys(this.processList[pname].need))
          stillNeeded.add(need);
      }
      if (stillNeeded.size > 0) {
        for (const [name, proc] of Object.entries(this.processList)) {
          if (processesCycle.includes(name)) continue;
          const producesNeeded = Object.keys(proc.result).some((r) =>
            stillNeeded.has(r)
          );
          if (!producesNeeded) continue;
          let canRun = true;
          for (const [need, qty] of Object.entries(proc.need)) {
            if ((this.updatedStock[need] || 0) < qty) {
              canRun = false;
              break;
            }
          }
          if (!canRun) continue;
          if (this.finalizeProcessIfPossible(name)) {
            processesCycle.push(name);
          }
        }
      }
    }

    // Strategy 4: Last resort - any feasible process (only for complex scenarios)
    if (this.isComplexScenario() && processesCycle.length === 0) {
      for (const [name, proc] of Object.entries(this.processList)) {
        if (processesCycle.includes(name)) continue;
        let canRun = true;
        for (const [need, qty] of Object.entries(proc.need)) {
          if ((this.updatedStock[need] || 0) < qty) {
            canRun = false;
            break;
          }
        }
        if (!canRun) continue;
        if (this.finalizeProcessIfPossible(name)) {
          processesCycle.push(name);
          break;
        }
      }
    }

    return processesCycle;
  }

  /**
   * Check if a process can run and consume its required resources
   * Returns true if process can be executed, false otherwise
   */
  private finalizeProcessIfPossible(processName: string): boolean {
    const tempStock = { ...this.updatedStock };
    for (const [element, quantity] of Object.entries(
      this.processList[processName].need
    )) {
      if ((tempStock[element] || 0) < quantity) {
        return false; // Not enough resources
      }
      tempStock[element] -= quantity; // Consume resources
    }
    this.updatedStock = tempStock;
    return true;
  }

  /**
   * Schedule process completion times
   * Returns updated todoList with completion schedules
   */
  private updateProcessList(
    currentCycle: number,
    actions: string[],
    todoList: TodoList
  ): TodoList {
    for (const action of actions) {
      const scheduledCycle = currentCycle + this.processList[action].delay;
      // Check if the scheduled time exceeds the time limit
      if (scheduledCycle <= this.maxDelay) {
        if (!todoList[scheduledCycle]) {
          todoList[scheduledCycle] = [];
        }
        todoList[scheduledCycle].push(action);
      }
    }
    return todoList;
  }

  /**
   * Plan which processes to execute (creates instructionDict)
   * This is the core planning phase before execution
   */
  private retrieveInstructions(processList: ProcessList): void {
    // Start by planning to produce the target resource
    this.selectProcess(this.optimizationTarget, -1, processList);

    if (this.isComplexScenario()) {
      // For complex scenarios: iterative planning with pruning
      while (Object.keys(this.requiredStock).length > 0) {
        // Prune non-positive entries to avoid looping on negatives (e.g., year:-1)
        for (const k of Object.keys(this.requiredStock)) {
          if ((this.requiredStock[k] || 0) <= 0) delete this.requiredStock[k];
        }
        if (Object.keys(this.requiredStock).length === 0) break;

        // Prefer a resource with a positive unmet need
        const keys = Object.keys(this.requiredStock);
        const requiredName =
          keys.find((k) => (this.requiredStock[k] || 0) > 0) || keys[0];
        if (
          !this.selectProcess(
            requiredName,
            this.requiredStock[requiredName],
            processList
          )
        ) {
          break;
        }
      }
    } else {
      // For simple scenarios: straightforward planning
      while (Object.keys(this.requiredStock).length > 0) {
        const requiredName = Object.keys(this.requiredStock)[0];
        if (
          !this.selectProcess(
            requiredName,
            this.requiredStock[requiredName],
            processList
          )
        ) {
          break;
        }
      }
    }
  }

  /**
   * Select and plan a process to produce a required resource
   * This is the core decision-making algorithm
   */
  private selectProcess(
    requiredName: string,
    requiredQuantity: number,
    processList: ProcessList
  ): boolean {
    const currentStockRequired = this.currentStock[requiredName] || 0;

    // Decide whether to use existing stock or produce more
    if (
      currentStockRequired === 0 ||
      requiredQuantity === -1 ||
      Math.random() * 10 >= 9 || // 10% chance to produce even if we have stock
      this.maxInstructions <= 0
    ) {
      // Find all processes that can produce the required resource
      const possibleProcessList = this.listPossibleProcesses(
        requiredName,
        processList
      );

      if (!possibleProcessList.length || this.maxInstructions <= 0) {
        return false;
      }

      // Choose the best process based on scenario type
      let chosenProcess: Process;
      if (this.isComplexScenario()) {
        // For complex scenarios: deterministic choice for optimal results
        if (requiredName === this.optimizationTarget) {
          // For target resource: choose process with best efficiency (output/delay)
          let best = -Infinity;
          chosenProcess = possibleProcessList[0];
          for (const p of possibleProcessList) {
            const out = p.result[this.optimizationTarget] || 0;
            const score = out / Math.max(1, p.delay);
            if (score > best) {
              best = score;
              chosenProcess = p;
            }
          }
        } else {
          // For other resources: prefer faster, simpler processes
          chosenProcess = possibleProcessList.slice().sort((a, b) => {
            const da = a.delay || 0;
            const db = b.delay || 0;
            if (da !== db) return da - db; // Prefer faster
            const oa = a.result[requiredName] || 0;
            const ob = b.result[requiredName] || 0;
            if (oa !== ob) return ob - oa; // Prefer bigger output
            const ia = Object.keys(a.need).length;
            const ib = Object.keys(b.need).length;
            return ia - ib; // Prefer simpler (fewer inputs)
          })[0];
        }
      } else {
        // For simple scenarios: random choice
        chosenProcess =
          possibleProcessList[
            Math.floor(Math.random() * possibleProcessList.length)
          ];
      }
      const processName = chosenProcess.name;

      // Plan to execute this process
      this.instructionDict[processName] =
        (this.instructionDict[processName] || 0) + 1;

      // Update required resources (add needs, subtract outputs)
      StockManager.update(this.requiredStock, chosenProcess.need, '+');
      StockManager.update(this.requiredStock, chosenProcess.result, '-');

      // Plan multiple executions if needed
      while (this.requiredStock[requiredName] && this.maxInstructions > 0) {
        if ((this.requiredStock[requiredName] || 0) >= requiredQuantity) {
          this.maxInstructions--;
          break;
        }

        this.instructionDict[processName]++;
        StockManager.update(this.requiredStock, chosenProcess.need, '+');
        StockManager.update(this.requiredStock, chosenProcess.result, '-');
        this.maxInstructions--;
      }
    } else {
      // Use existing stock instead of producing more
      const tempQuantity = currentStockRequired - requiredQuantity;
      this.currentStock[requiredName] = tempQuantity < 0 ? 0 : tempQuantity;
      if (tempQuantity < 0) {
        // Need more than we have, add to required stock
        StockManager.update(
          this.currentStock,
          { [requiredName]: tempQuantity },
          '-'
        );
      } else {
        // Have enough, remove from required stock
        delete this.requiredStock[requiredName];
      }
    }

    return true;
  }

  /**
   * Find all processes that can produce a specific resource
   */
  private listPossibleProcesses(
    requiredName: string,
    processList: ProcessList
  ): Process[] {
    const possibleProcessList: Process[] = [];
    for (const process of Object.values(processList)) {
      if (requiredName in process.result) {
        possibleProcessList.push(process);
      }
    }
    return possibleProcessList;
  }

  /**
   * Display execution progress with visual progress bar
   */
  public displayProcess(): void {
    // Calculate total number of process cycles for progress bar
    const totalProcesses = this.goodInstructions.reduce(
      (total, instruction) => total + instruction.processes.length,
      0
    );

    if (totalProcesses === 0) {
      console.log('No processes to execute');
      return;
    }

    const progressBar = new cliProgress.SingleBar({
      format: 'Executing processes |{bar}| {percentage}%',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(totalProcesses, 0);

    let processedCount = 0;
    for (const instruction of this.goodInstructions) {
      if (instruction.processes.length > 0) {
        // Simulate processing time for each process
        for (const process of instruction.processes) {
          processedCount++;
          progressBar.update(processedCount);
          // Small delay to make progress visible
          const start = Date.now();
          while (Date.now() - start < 10) {
            // Brief pause
          }
        }
      }
    }
    progressBar.stop();
    console.log('');
    console.log(`📝 Main walk logged to: resources/${this.fileName}.log`);
  }
}
