import {
  Config,
  Process,
  SimulationResult,
  StockState,
  ProcessState,
  PriorityState,
  RunningProcess
} from './types';

// Pure function to calculate future resource availability at a given time
export const calculateFutureStocks = (
  currentStocks: StockState,
  runningProcesses: readonly RunningProcess[],
  targetTime: number
): StockState => {
  const futureStocks = new Map(currentStocks);

  // Add resources that will be produced by running processes before targetTime
  for (const process of runningProcesses) {
    if (process.completionTime <= targetTime) {
      for (const [resource, quantity] of process.processPtr.outputs) {
        futureStocks.set(
          resource,
          (futureStocks.get(resource) || 0) + quantity
        );
      }
    }
  }

  return futureStocks;
};

// Pure function to check if a process can be started
export const canStartProcess = (
  process: Process,
  stocks: StockState,
  runningProcesses: readonly RunningProcess[],
  currentTime: number
): boolean => {
  // Create a copy of stocks to track resource availability
  const availableStocks = new Map(stocks);

  // First check immediate resource availability
  for (const [resource, required] of process.inputs) {
    const available = availableStocks.get(resource) || 0;
    if (available < required) {
      return false;
    }
  }

  // Check if any running processes will need these resources
  for (const running of runningProcesses) {
    for (const [resource, required] of running.processPtr.inputs) {
      const available = availableStocks.get(resource) || 0;
      if (available < required) {
        return false;
      }
      availableStocks.set(resource, available - required);
    }
  }

  return true;
};

// Pure function to update stocks after process completion
export const updateStocksAfterProcess = (
  process: Process,
  stocks: StockState
): StockState => {
  const newStocks = new Map(stocks);

  // Remove inputs
  for (const [resource, quantity] of process.inputs) {
    const currentQty = newStocks.get(resource) || 0;
    if (currentQty >= quantity) {
      newStocks.set(resource, currentQty - quantity);
    } else {
      // If we don't have enough resources, don't update stocks
      return stocks;
    }
  }

  // Add outputs
  for (const [resource, quantity] of process.outputs) {
    const currentQty = newStocks.get(resource) || 0;
    newStocks.set(resource, currentQty + quantity);
  }

  return newStocks;
};

// Pure function to build process priorities
export const buildProcessPriority = (
  processes: readonly Process[],
  optimizeGoals: readonly string[]
): PriorityState => {
  const priority = new Map<string, number>();
  const goalSet = new Set(optimizeGoals.filter((g) => g !== 'time'));
  const dependencyGraph = new Map<string, Set<string>>();
  const resourceProducers = new Map<string, Set<string>>();

  // Build dependency graph and resource producers map
  for (const process of processes) {
    // Track what resources each process produces
    for (const [output] of process.outputs) {
      if (!resourceProducers.has(output)) {
        resourceProducers.set(output, new Set());
      }
      resourceProducers.get(output)!.add(process.name);
    }

    // Build dependency graph
    for (const [input] of process.inputs) {
      if (!dependencyGraph.has(process.name)) {
        dependencyGraph.set(process.name, new Set());
      }
      // Find processes that produce this input
      if (resourceProducers.has(input)) {
        for (const producer of resourceProducers.get(input)!) {
          dependencyGraph.get(process.name)!.add(producer);
        }
      }
    }
  }

  // Find goal producers and their dependencies
  const goalProducers = new Set<string>();
  for (const goal of goalSet) {
    if (resourceProducers.has(goal)) {
      for (const producer of resourceProducers.get(goal)!) {
        goalProducers.add(producer);
      }
    }
  }

  // Assign priorities based on distance from goal producers
  const visited = new Set<string>();
  const queue: [string, number][] = [];

  // Start with goal producers at priority 0
  for (const producer of goalProducers) {
    queue.push([producer, 0]);
    priority.set(producer, 0);
    visited.add(producer);
  }

  // Breadth-first search to assign priorities
  while (queue.length > 0) {
    const [process, level] = queue.shift()!;

    if (dependencyGraph.has(process)) {
      for (const dep of dependencyGraph.get(process)!) {
        if (!visited.has(dep)) {
          queue.push([dep, level + 1]);
          priority.set(dep, level + 1);
          visited.add(dep);
        } else {
          // For cyclic dependencies, use the minimum priority
          const currentPriority = priority.get(dep) ?? Infinity;
          if (level + 1 < currentPriority) {
            priority.set(dep, level + 1);
            queue.push([dep, level + 1]);
          }
        }
      }
    }
  }

  // Special handling for cyclic processes that produce their own inputs
  for (const process of processes) {
    const inputs = new Set(process.inputs.keys());
    const outputs = new Set(process.outputs.keys());
    const isCyclic = Array.from(inputs).some((input) => outputs.has(input));
    if (isCyclic) {
      const currentPriority = priority.get(process.name) ?? Infinity;
      priority.set(process.name, Math.min(currentPriority, 1)); // Prioritize cyclic processes
    }
  }

  // Assign default priority to any remaining processes
  for (const process of processes) {
    if (!priority.has(process.name)) {
      priority.set(process.name, 3);
    }
  }

  return priority;
};

// Pure function to pick the best process from candidates
export const pickBestProcess = (
  candidates: readonly Process[],
  priority: PriorityState
): Process => {
  return candidates.reduce((best, current) => {
    const priorityA = priority.get(best.name) ?? 3;
    const priorityB = priority.get(current.name) ?? 3;

    if (priorityA !== priorityB) {
      return priorityA < priorityB ? best : current;
    }
    return best.nbCycle < current.nbCycle ? best : current;
  });
};

// Pure function to calculate fitness
const calculateFitness = (
  stocks: StockState,
  initialStocks: StockState,
  optimizeGoals: readonly string[],
  finalCycle: number,
  executedProcessCount: number
): number => {
  const optimizeTime = optimizeGoals.includes('time');
  let resourceScore = 0;
  let resourceCount = 0;
  let hasNegativeStock = false;

  // Check for negative stocks (invalid state)
  for (const [resource, quantity] of stocks) {
    if (quantity < 0) {
      hasNegativeStock = true;
      break;
    }
  }

  if (hasNegativeStock) {
    return -1;
  }

  // Calculate goal resources produced
  for (const goal of optimizeGoals) {
    if (goal !== 'time') {
      const produced = (stocks.get(goal) || 0) - (initialStocks.get(goal) || 0);
      if (produced > 0) {
        // For time-based resources, give extra weight to higher units
        if (goal === 'year') {
          resourceScore += produced * 1000;
        } else if (goal === 'day') {
          resourceScore += produced * 100;
        } else if (goal === 'hour') {
          resourceScore += produced * 10;
        } else if (goal === 'minute') {
          resourceScore += produced * 2;
        } else {
          resourceScore += produced;
        }
      }
      resourceCount++;
    }
  }

  // No resources produced
  if (resourceCount > 0 && resourceScore <= 0) {
    return -1;
  }

  // Calculate fitness
  let fitness = resourceScore;

  // Time optimization
  if (optimizeTime && finalCycle > 0) {
    // Normalize time component to be between 0 and 1
    const timeComponent = 1.0 / (1.0 + finalCycle);
    // Weight resource score more heavily than time
    fitness = resourceScore * 0.7 + timeComponent * resourceScore * 0.3;
  }

  // Add small bonus for executed processes to prefer longer valid sequences
  // For time-based processes, give higher bonus to encourage resource accumulation
  const processBonus = optimizeTime ? 0.01 : 0.1;
  fitness += executedProcessCount * processBonus;

  // Add bonus for maintaining cyclic resources (like clock)
  const cyclicResources = new Set(['clock']);
  let cyclicBonus = 0;
  for (const resource of cyclicResources) {
    const initial = initialStocks.get(resource) || 0;
    const final = stocks.get(resource) || 0;
    if (final >= initial) {
      cyclicBonus += 0.5; // Bonus for maintaining cyclic resources
    }
  }
  fitness += cyclicBonus;

  return fitness;
};

// Pure function to run simulation
export const runSimulation = (
  config: Config,
  processSequence: readonly string[],
  timeLimit: number
): SimulationResult => {
  const processMap = new Map(config.processes.map((p) => [p.name, p]));
  const priority = buildProcessPriority(config.processes, config.optimizeGoals);

  let stocks = new Map(config.stocks.map((s) => [s.name, s.quantity]));
  const initialStocks = new Map(stocks);
  let executionLog: Array<[number, string]> = [];
  let currentTime = 0;
  let executedProcessCount = 0;
  let timeoutReached = false;

  // Priority queue for running processes
  const runningProcesses: RunningProcess[] = [];
  const addProcess = (p: RunningProcess) => {
    runningProcesses.push(p);
    runningProcesses.sort((a, b) => a.completionTime - b.completionTime);
  };

  let sequenceIndex = 0;
  let opportunistMode = false;

  while (currentTime <= timeLimit) {
    let stocksUpdated = false;
    let startedProcess = false;

    // Complete finished processes
    while (
      runningProcesses.length > 0 &&
      runningProcesses[0].completionTime <= currentTime
    ) {
      const finished = runningProcesses.shift()!;
      const newStocks = updateStocksAfterProcess(finished.processPtr, stocks);
      if (newStocks === stocks) {
        // Process couldn't be completed due to resource constraints
        continue;
      }
      stocks = newStocks;
      executedProcessCount++;
      stocksUpdated = true;
    }

    if (currentTime >= timeLimit) {
      timeoutReached = true;
      break;
    }

    // Try to start new processes
    let tryMore = true;
    while (tryMore) {
      tryMore = false;
      let chosenProcess: Process | undefined;
      let fromSequence = false;

      if (!opportunistMode && sequenceIndex < processSequence.length) {
        const processName = processSequence[sequenceIndex];
        chosenProcess = processMap.get(processName);
        fromSequence = true;
      } else {
        opportunistMode = true;
        const candidates = config.processes.filter((p) =>
          canStartProcess(p, stocks, runningProcesses, currentTime)
        );
        if (candidates.length > 0) {
          chosenProcess = pickBestProcess(candidates, priority);
        }
      }

      if (!chosenProcess) {
        if (fromSequence) sequenceIndex++;
        continue;
      }

      if (
        !canStartProcess(
          chosenProcess,
          stocks,
          runningProcesses,
          currentTime
        ) ||
        currentTime + chosenProcess.nbCycle > timeLimit
      ) {
        if (fromSequence) sequenceIndex++;
        continue;
      }

      // Start the process
      const newStocks = updateStocksAfterProcess(chosenProcess, stocks);
      if (newStocks === stocks) {
        // Process couldn't be started due to resource constraints
        if (fromSequence) sequenceIndex++;
        continue;
      }
      stocks = newStocks;
      addProcess({
        processPtr: chosenProcess,
        completionTime: currentTime + chosenProcess.nbCycle
      });

      executionLog.push([currentTime, chosenProcess.name]);
      startedProcess = true;
      tryMore = true;
      if (fromSequence) sequenceIndex++;
    }

    if (!startedProcess && !stocksUpdated) {
      if (runningProcesses.length === 0) break;
      currentTime = Math.min(runningProcesses[0].completionTime, timeLimit);
    } else {
      currentTime++;
    }
  }

  // Complete remaining processes that finish before timeLimit
  while (
    runningProcesses.length > 0 &&
    runningProcesses[0].completionTime <= timeLimit
  ) {
    const finished = runningProcesses.shift()!;
    const newStocks = updateStocksAfterProcess(finished.processPtr, stocks);
    if (newStocks !== stocks) {
      stocks = newStocks;
    }
  }

  // Calculate final cycle
  const finalCycle = Math.min(
    executionLog.reduce((max, [start, name]) => {
      const process = processMap.get(name)!;
      return Math.max(max, start + process.nbCycle);
    }, 0),
    timeLimit
  );

  // Calculate fitness
  const fitness = calculateFitness(
    stocks,
    initialStocks,
    config.optimizeGoals,
    finalCycle,
    executedProcessCount
  );

  return {
    finalStocks: stocks,
    executionLog,
    finalCycle,
    timeoutReached,
    fitness
  };
};
