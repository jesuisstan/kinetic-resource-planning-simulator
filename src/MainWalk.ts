import {
  Stock,
  Process,
  ProcessList,
  InstructionDict,
  GoodInstruction,
  TodoList
} from './types';
import { StockManager } from './utils';
import * as cliProgress from 'cli-progress';

export class MainWalk {
  private optimizationTarget: string;
  private processList: ProcessList;
  private maxInstructions: number;
  private maxDelay: number;
  private currentStock: Stock;
  private updatedStock: Stock;
  private requiredStock: Stock;
  private instructionDict: InstructionDict;
  private fileName: string;
  public goodInstructions: GoodInstruction[];
  public score: number;
  public created: number;
  public loop: boolean;

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

    this.retrieveInstructions(processList);
    this.finalizeProcess(maxCycle);
    this.calculateScore(initialStock);
  }

  private calculateScore(initialStock: Stock): void {
    this.created = this.updatedStock[this.optimizationTarget] || 0;

    if (
      !this.goodInstructions.length ||
      this.goodInstructions[this.goodInstructions.length - 1].cycle === 0
    ) {
      this.score = 0;
    } else {
      this.score =
        this.created /
        this.goodInstructions[this.goodInstructions.length - 1].cycle;
    }

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

  private finalizeProcess(maxCycle: number): GoodInstruction[] {
    let currentCycle = 0;
    const possibleProcesses = this.finalizePossibleProcesses(
      this.instructionDict
    );
    this.goodInstructions = [
      { cycle: currentCycle, processes: possibleProcesses }
    ];
    let todoList = this.updateProcessList(currentCycle, possibleProcesses, {});

    while (Object.keys(todoList).length > 0 && currentCycle <= maxCycle) {
      currentCycle = Math.min(...Object.keys(todoList).map(Number));

      // Check if the next process exceeds the time limit
      if (currentCycle > this.maxDelay) {
        break;
      }

      for (const processName of todoList[currentCycle]) {
        StockManager.update(
          this.updatedStock,
          this.processList[processName].result,
          '+'
        );
      }
      delete todoList[currentCycle];

      const possibleProcesses = this.finalizePossibleProcesses(
        this.instructionDict
      );
      this.goodInstructions.push({
        cycle: currentCycle,
        processes: possibleProcesses
      });
      todoList = this.updateProcessList(
        currentCycle,
        possibleProcesses,
        todoList
      );
    }
    return this.goodInstructions;
  }

  private finalizePossibleProcesses(
    instructionDict: InstructionDict
  ): string[] {
    const processesCycle: string[] = [];

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

    return processesCycle;
  }

  private finalizeProcessIfPossible(processName: string): boolean {
    const tempStock = { ...this.updatedStock };
    for (const [element, quantity] of Object.entries(
      this.processList[processName].need
    )) {
      if ((tempStock[element] || 0) < quantity) {
        return false;
      }
      tempStock[element] -= quantity;
    }
    this.updatedStock = tempStock;
    return true;
  }

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

  private retrieveInstructions(processList: ProcessList): void {
    this.selectProcess(this.optimizationTarget, -1, processList);
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

  private selectProcess(
    requiredName: string,
    requiredQuantity: number,
    processList: ProcessList
  ): boolean {
    const currentStockRequired = this.currentStock[requiredName] || 0;

    if (
      currentStockRequired === 0 ||
      requiredQuantity === -1 ||
      Math.random() * 10 >= 9 ||
      this.maxInstructions <= 0
    ) {
      const possibleProcessList = this.listPossibleProcesses(
        requiredName,
        processList
      );

      if (!possibleProcessList.length || this.maxInstructions <= 0) {
        return false;
      }

      const chosenProcess =
        possibleProcessList[
          Math.floor(Math.random() * possibleProcessList.length)
        ];
      const processName = chosenProcess.name;

      this.instructionDict[processName] =
        (this.instructionDict[processName] || 0) + 1;

      StockManager.update(this.requiredStock, chosenProcess.need, '+');
      StockManager.update(this.requiredStock, chosenProcess.result, '-');

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
      const tempQuantity = currentStockRequired - requiredQuantity;
      this.currentStock[requiredName] = tempQuantity < 0 ? 0 : tempQuantity;
      if (tempQuantity < 0) {
        StockManager.update(
          this.currentStock,
          { [requiredName]: tempQuantity },
          '-'
        );
      } else {
        delete this.requiredStock[requiredName];
      }
    }

    return true;
  }

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
    console.log(`📝 Main walk logged to: resources/${this.fileName}.log`);
  }
}
