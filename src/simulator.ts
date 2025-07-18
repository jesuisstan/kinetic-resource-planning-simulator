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
  currentTime: number,
  reservedResources: Map<string, number> = new Map()
): boolean => {
  // Create a copy of stocks to track resource availability
  const availableStocks = new Map(stocks);

  // First check immediate resource availability considering reserved resources
  for (const [resource, required] of process.inputs) {
    const available = availableStocks.get(resource) || 0;
    const reserved = reservedResources.get(resource) || 0;
    if (available - reserved < required) {
      return false;
    }
  }

  // Check if any running processes will need these resources
  for (const running of runningProcesses) {
    for (const [resource, required] of running.processPtr.inputs) {
      const available = availableStocks.get(resource) || 0;
      const reserved = reservedResources.get(resource) || 0;
      if (available - reserved < required) {
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

// Helper to find processes that produce a resource
const findProducers = (
  resource: string,
  processes: readonly Process[]
): Process[] => {
  return processes.filter((p) =>
    Array.from(p.outputs.keys()).includes(resource)
  );
};

// Helper to find processes that consume a resource
const findConsumers = (
  resource: string,
  processes: readonly Process[]
): Process[] => {
  return processes.filter((p) =>
    Array.from(p.inputs.keys()).includes(resource)
  );
};

// Helper to calculate process efficiency
export const calculateProcessEfficiency = (process: Process): number => {
  const totalInputs = Array.from(process.inputs.values()).reduce(
    (a, b) => a + b,
    0
  );
  const totalOutputs = Array.from(process.outputs.values()).reduce(
    (a, b) => a + b,
    0
  );
  return totalOutputs / (totalInputs * process.nbCycle);
};

// Helper to calculate resource value
const calculateResourceValue = (
  resource: string,
  optimizeGoals: readonly string[],
  stocks: StockState,
  initialStocks: StockState
): number => {
  // If it's a goal resource, it has higher value
  if (optimizeGoals.includes(resource) && resource !== 'time') {
    const produced =
      (stocks.get(resource) || 0) - (initialStocks.get(resource) || 0);
    return produced;
  }

  // Special handling for 'euro' resource
  if (resource === 'euro') {
    const produced =
      (stocks.get(resource) || 0) - (initialStocks.get(resource) || 0);
    return produced * 0.01; // Small weight for profit/cost
  }

  return 0; // Don't consider other resources in fitness
};

// Helper to find resource depth in transformation chains
const findResourceDepth = (
  resource: string,
  processes: readonly Process[],
  visited: Set<string> = new Set()
): number => {
  if (visited.has(resource)) return 0;
  visited.add(resource);

  const producers = findProducers(resource, processes);
  if (producers.length === 0) return 0;

  let maxDepth = 0;
  for (const producer of producers) {
    for (const [input] of producer.inputs) {
      const depth = findResourceDepth(input, processes, visited);
      maxDepth = Math.max(maxDepth, depth + 1);
    }
  }
  return maxDepth;
};

// Pure function to build process priorities
export const buildProcessPriority = (
  processes: readonly Process[],
  optimizeGoals: readonly string[]
): PriorityState => {
  const priority = new Map<string, number>();
  const goalSet = new Set(optimizeGoals.filter((g) => g !== 'time'));

  // First assign priority 0 to processes that directly produce goal resources
  for (const process of processes) {
    for (const [output] of process.outputs) {
      if (goalSet.has(output)) {
        priority.set(process.name, 0);
        break;
      }
    }
  }

  // Calculate resource depths
  const resourceDepths = new Map<string, number>();
  for (const goal of goalSet) {
    resourceDepths.set(goal, findResourceDepth(goal, processes));
  }

  // Assign priorities based on resource depths and process efficiency
  for (const process of processes) {
    if (priority.has(process.name)) continue;

    let maxDepth = 0;
    for (const [output] of process.outputs) {
      const depth = resourceDepths.get(output) ?? 0;
      maxDepth = Math.max(maxDepth, depth);
    }

    // Calculate process efficiency
    const efficiency = calculateProcessEfficiency(process);

    // Priority is based on depth and efficiency
    // Lower number = higher priority
    priority.set(process.name, Math.max(1, 3 - maxDepth - efficiency));
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
  executedProcessCount: number,
  executionLog: readonly [number, string][],
  processMap: ReadonlyMap<string, Process>
): number => {
  const optimizeTime = optimizeGoals.includes('time');
  let resourceScore = 0;

  // Calculate goal resources produced
  for (const goal of optimizeGoals) {
    if (goal !== 'time') {
      const produced = (stocks.get(goal) || 0) - (initialStocks.get(goal) || 0);
      resourceScore += produced;
    }
  }

  // Time optimization
  if (optimizeTime) {
    resourceScore /= 1.0 + finalCycle;
  }

  // Add small bonus for executed processes
  resourceScore += executedProcessCount * (optimizeTime ? 0.001 : 0.01);

  // No processes executed and no resources produced
  if (resourceScore === 0 && executedProcessCount === 0) {
    return -1e9;
  }

  return resourceScore;
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

  // Track reserved resources
  const reservedResources = new Map<string, number>();

  // Helper to reserve resources
  const reserveResources = (process: Process) => {
    for (const [resource, quantity] of process.inputs) {
      const current = reservedResources.get(resource) || 0;
      reservedResources.set(resource, current + quantity);
    }
  };

  // Helper to release resources
  const releaseResources = (process: Process) => {
    for (const [resource, quantity] of process.inputs) {
      const current = reservedResources.get(resource) || 0;
      reservedResources.set(resource, current - quantity);
    }
  };

  // Helper to check resource availability
  const hasEnoughResources = (process: Process): boolean => {
    for (const [resource, required] of process.inputs) {
      const available = stocks.get(resource) || 0;
      const reserved = reservedResources.get(resource) || 0;
      if (available - reserved < required) {
        return false;
      }
    }
    return true;
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
      // Release reserved resources
      releaseResources(finished.processPtr);
      // Add outputs to stocks
      for (const [resource, quantity] of finished.processPtr.outputs) {
        const current = stocks.get(resource) || 0;
        stocks.set(resource, current + quantity);
      }
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
          hasEnoughResources(p)
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
        !hasEnoughResources(chosenProcess) ||
        currentTime + chosenProcess.nbCycle > timeLimit
      ) {
        if (fromSequence) sequenceIndex++;
        continue;
      }

      // Reserve resources and start process
      reserveResources(chosenProcess);
      // Remove inputs from stocks
      for (const [resource, quantity] of chosenProcess.inputs) {
        const current = stocks.get(resource) || 0;
        stocks.set(resource, current - quantity);
      }
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
    releaseResources(finished.processPtr);
    for (const [resource, quantity] of finished.processPtr.outputs) {
      const current = stocks.get(resource) || 0;
      stocks.set(resource, current + quantity);
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
    executedProcessCount,
    executionLog,
    processMap
  );

  return {
    finalStocks: stocks,
    executionLog,
    finalCycle,
    timeoutReached,
    fitness
  };
};
