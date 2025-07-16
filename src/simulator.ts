import { ConfigData, Process, Stock } from './parser';

/**
 * Represents a running process instance in the simulation
 */
export interface ProcessInstance {
  process: Process;
  startTime: number;
  endTime: number;
}

/**
 * Log entry for each simulation step
 */
export interface StepLog {
  time: number;
  started: string[]; // Process names that started at this time
  finished: string[]; // Process names that finished at this time
  stocksBefore: { [key: string]: number };
  stocksAfter: { [key: string]: number };
}

/**
 * Complete simulation result
 */
export interface SimulationResult {
  trace: { cycle: number; process: string }[];
  stepLogs: StepLog[];
  lastCycle: number;
  finalStocks: { [key: string]: number };
}

/**
 * Helper: get all processes that can produce a given resource
 */
const getProducersFor = (processes: Process[], resource: string): Process[] => {
  return processes.filter((p) => p.results.some((r) => r.name === resource));
};

/**
 * Helper: get all resources needed to produce a target resource
 */
const getRequiredResources = (
  processes: Process[],
  target: string,
  visited: Set<string> = new Set()
): Set<string> => {
  if (visited.has(target)) return new Set();
  visited.add(target);

  const required = new Set<string>();
  const producers = getProducersFor(processes, target);

  for (const proc of producers) {
    proc.needs.forEach((need) => {
      required.add(need.name);
      const subRequired = getRequiredResources(processes, need.name, visited);
      subRequired.forEach((r) => required.add(r));
    });
  }

  return required;
};

/**
 * Helper: calculate resource requirements for a target
 */
const calculateResourceNeeds = (
  processes: Process[],
  target: string,
  quantity: number = 1,
  visited: Set<string> = new Set()
): Map<string, number> => {
  if (visited.has(target)) return new Map();
  visited.add(target);

  const needs = new Map<string, number>();
  const producers = getProducersFor(processes, target);

  if (producers.length === 0) return needs;

  // Find the most efficient producer
  const bestProducer = producers.reduce((best, curr) => {
    const bestOutput =
      best.results.find((r) => r.name === target)?.quantity || 0;
    const currOutput =
      curr.results.find((r) => r.name === target)?.quantity || 0;
    return currOutput > bestOutput ? curr : best;
  });

  const outputQty =
    bestProducer.results.find((r) => r.name === target)?.quantity || 1;
  const batchesNeeded = Math.ceil(quantity / outputQty);

  // Add direct needs
  bestProducer.needs.forEach((need) => {
    needs.set(
      need.name,
      (needs.get(need.name) || 0) + need.quantity * batchesNeeded
    );
  });

  // Add recursive needs
  bestProducer.needs.forEach((need) => {
    const subNeeds = calculateResourceNeeds(
      processes,
      need.name,
      needs.get(need.name) || 0,
      visited
    );
    subNeeds.forEach((qty, res) => {
      needs.set(res, (needs.get(res) || 0) + qty);
    });
  });

  return needs;
};

/**
 * Calculate initial resource allocation based on optimization targets
 * This function:
 * 1. Analyzes resource needs for each target
 * 2. Calculates maximum possible units of each target
 * 3. Determines optimal resource distribution
 * 4. Allocates resources based on process dependencies
 */
const calculateInitialAllocation = (
  processes: Process[],
  stocks: { [key: string]: number },
  optimizeTargets: string[]
): Map<string, number> => {
  const allocation = new Map<string, number>();
  const totalResources = { ...stocks };

  // Calculate resource needs for one unit of each target
  const targetNeeds = new Map<string, Map<string, number>>();
  for (const target of optimizeTargets) {
    targetNeeds.set(target, calculateResourceNeeds(processes, target));
  }

  // Calculate how many units of each target we can make
  const maxUnits = new Map<string, number>();
  for (const [target, needs] of targetNeeds.entries()) {
    let minUnits = Infinity;
    for (const [resource, needed] of needs.entries()) {
      const available = totalResources[resource] || 0;
      const possibleUnits = Math.floor(available / needed);
      minUnits = Math.min(minUnits, possibleUnits);
    }
    maxUnits.set(target, minUnits === Infinity ? 0 : minUnits);
  }

  // Calculate optimal resource distribution
  const resourceDistribution = new Map<string, Map<string, number>>();
  for (const [target, needs] of targetNeeds.entries()) {
    const targetDist = new Map<string, number>();
    const units = maxUnits.get(target) || 0;
    if (units > 0) {
      for (const [resource, needed] of needs.entries()) {
        const total = needed * units;
        targetDist.set(resource, total);
      }
    }
    resourceDistribution.set(target, targetDist);
  }

  // Calculate process dependencies and order
  const processOrder = new Map<string, number>();
  const visited = new Set<string>();

  function calculateProcessOrder(process: Process, depth: number = 0) {
    if (visited.has(process.name)) return;
    visited.add(process.name);

    // Calculate order based on dependencies
    let maxDependencyDepth = depth;
    for (const need of process.needs) {
      const producers = processes.filter((p) =>
        p.results.some((r) => r.name === need.name)
      );
      for (const producer of producers) {
        if (!visited.has(producer.name)) {
          calculateProcessOrder(producer, depth + 1);
        }
        const producerDepth = processOrder.get(producer.name) || 0;
        maxDependencyDepth = Math.max(maxDependencyDepth, producerDepth + 1);
      }
    }
    processOrder.set(process.name, maxDependencyDepth);
  }

  // Calculate process order for each target
  for (const target of optimizeTargets) {
    const targetProcess = processes.find((p) =>
      p.results.some((r) => r.name === target)
    );
    if (targetProcess) {
      calculateProcessOrder(targetProcess);
    }
  }

  // Sort processes by dependency order
  const sortedProcesses = [...processes].sort((a, b) => {
    const orderA = processOrder.get(a.name) || 0;
    const orderB = processOrder.get(b.name) || 0;
    return orderA - orderB;
  });

  // Allocate resources for each process in order
  for (const process of sortedProcesses) {
    // Check if this process produces any needed resources
    const producesNeeded = process.results.some((result) => {
      for (const [target, dist] of resourceDistribution.entries()) {
        if (dist.has(result.name)) return true;
      }
      return false;
    });

    if (producesNeeded) {
      // Calculate how many times we can run this process
      let maxRuns = Infinity;
      for (const need of process.needs) {
        const available = totalResources[need.name] || 0;
        const runs = Math.floor(available / need.quantity);
        maxRuns = Math.min(maxRuns, runs);
      }

      if (maxRuns > 0 && maxRuns !== Infinity) {
        // Allocate resources for this process
        for (const need of process.needs) {
          const total = need.quantity * maxRuns;
          allocation.set(need.name, (allocation.get(need.name) || 0) + total);
        }
      }
    }
  }

  return allocation;
};

/**
 * Evaluate process priority based on optimization goals
 * Considers:
 * 1. Direct contribution to targets
 * 2. Resource dependencies
 * 3. Resource scarcity
 * 4. Process efficiency
 */
const evaluateProcessPriority = (
  process: Process,
  stocks: { [key: string]: number },
  optimizeTargets: string[],
  processes: Process[],
  allocation: Map<string, number>
): number => {
  let priority = 0;

  // Direct contribution to optimize targets
  for (const result of process.results) {
    if (optimizeTargets.includes(result.name)) {
      priority += 1000 * result.quantity;
    }
  }

  // Calculate how many of each resource we need for one target unit
  const targetProducers = optimizeTargets
    .map((target) => ({
      target,
      process: processes.find((p) => p.results.some((r) => r.name === target))
    }))
    .filter((x) => x.process);

  for (const { target, process } of targetProducers) {
    if (!process) continue;

    // Check if this process produces any needed resources
    const neededResources = process.needs.map((n) => n.name);
    const producesNeeded = process.results.some((r) =>
      neededResources.includes(r.name)
    );

    if (producesNeeded) {
      // This process produces resources needed for the target
      const missingResources = process.needs.filter(
        (n) => (stocks[n.name] || 0) < n.quantity
      );
      if (missingResources.length > 0) {
        // Prioritize processes that produce missing resources
        for (const result of process.results) {
          if (missingResources.some((n) => n.name === result.name)) {
            priority += 800 * result.quantity;
          }
        }
      }
    }
  }

  // Check if this process produces resources that are allocated
  for (const result of process.results) {
    const allocated = allocation.get(result.name) || 0;
    if (allocated > 0) {
      const have = stocks[result.name] || 0;
      if (have < allocated) {
        // Higher priority for allocated resources we don't have enough of
        priority +=
          700 * result.quantity * (1 + (allocated - have) / allocated);
      }
    }
  }

  // Resource efficiency - prefer processes that use abundant resources
  const resourceEfficiency = process.needs.reduce((acc, need) => {
    const available = stocks[need.name] || 0;
    const allocated = allocation.get(need.name) || 0;
    if (allocated > 0 && available < allocated) {
      // Penalize using scarce resources that are needed for targets
      return acc - (100 * (allocated - available)) / allocated;
    }
    return acc + 50;
  }, 0);
  priority += resourceEfficiency;

  // Time efficiency - shorter processes get higher priority
  priority += 100 / (process.delay + 1);

  return priority;
};

/**
 * Check if a process can be started with current stocks
 */
const canStartProcess = (
  process: Process,
  stocks: { [key: string]: number }
): boolean => {
  return process.needs.every((need) => stocks[need.name] >= need.quantity);
};

/**
 * Apply process needs/results to stocks
 */
const applyProcess = (
  process: Process,
  stocks: { [key: string]: number },
  isStart: boolean
): void => {
  const items = isStart ? process.needs : process.results;
  const operation = isStart
    ? (a: number, b: number) => a - b
    : (a: number, b: number) => a + b;

  items.forEach((item) => {
    stocks[item.name] = operation(stocks[item.name] || 0, item.quantity);
  });
};

/**
 * Main simulation function
 *
 * Algorithm:
 * 1. Initialize simulation state
 * 2. Calculate resource allocation
 * 3. For each time step:
 *    a. Complete finished processes
 *    b. Try to start new processes in parallel
 *    c. Update resource states
 *    d. Check if we can continue
 * 4. Return simulation results
 */
export const runSimulation = (
  config: ConfigData,
  maxDelay: number
): SimulationResult => {
  // Initialize result structure
  const result: SimulationResult = {
    trace: [],
    stepLogs: [],
    lastCycle: 0,
    finalStocks: {}
  };

  // Initialize stocks
  const stocks: { [key: string]: number } = {};
  config.stocks.forEach((stock) => {
    stocks[stock.name] = stock.quantity;
  });

  // Get optimization targets
  const optimizeTargets = [...config.optimize.stocks];
  if (config.optimize.time) {
    // For time optimization, we want to complete all processes as quickly as possible
    config.processes.forEach((p) => {
      p.results.forEach((r) => {
        if (!optimizeTargets.includes(r.name)) {
          optimizeTargets.push(r.name);
        }
      });
    });
  }

  // Calculate initial resource allocation
  const allocation = calculateInitialAllocation(
    config.processes,
    stocks,
    optimizeTargets
  );

  // Calculate process dependencies
  const processDependencies = new Map<string, Set<string>>();
  for (const process of config.processes) {
    const dependencies = new Set<string>();
    for (const need of process.needs) {
      // Find processes that produce this need
      const producers = config.processes.filter((p) =>
        p.results.some((r) => r.name === need.name)
      );
      producers.forEach((p) => dependencies.add(p.name));
    }
    processDependencies.set(process.name, dependencies);
  }

  // Track running processes
  const runningProcesses: ProcessInstance[] = [];
  let currentTime = 0;

  while (currentTime <= maxDelay) {
    const stepLog: StepLog = {
      time: currentTime,
      started: [],
      finished: [],
      stocksBefore: { ...stocks },
      stocksAfter: {}
    };

    // Check finished processes
    const stillRunning: ProcessInstance[] = [];
    for (const instance of runningProcesses) {
      if (instance.endTime === currentTime) {
        // Process finished, apply results
        applyProcess(instance.process, stocks, false);
        stepLog.finished.push(instance.process.name);
        result.trace.push({
          cycle: currentTime,
          process: instance.process.name
        });
      } else {
        stillRunning.push(instance);
      }
    }
    runningProcesses.length = 0;
    runningProcesses.push(...stillRunning);

    // Try to start new processes
    let processStarted = false;
    do {
      processStarted = false;

      // Create a temporary stock state to simulate parallel process starts
      const tempStocks = { ...stocks };

      // Get all eligible processes and sort by priority
      const eligible = config.processes
        .filter((p) => canStartProcess(p, tempStocks))
        .map((p) => ({
          process: p,
          priority: evaluateProcessPriority(
            p,
            tempStocks,
            optimizeTargets,
            config.processes,
            allocation
          )
        }))
        .sort((a, b) => b.priority - a.priority);

      // Try to start multiple processes in parallel
      const toStart: Process[] = [];
      for (const { process } of eligible) {
        // Check if we can start this process with remaining resources
        if (canStartProcess(process, tempStocks)) {
          // Check if any dependencies are currently running
          const deps = processDependencies.get(process.name) || new Set();
          const hasRunningDeps = runningProcesses.some((rp) =>
            deps.has(rp.process.name)
          );

          if (!hasRunningDeps) {
            // Simulate resource consumption
            applyProcess(process, tempStocks, true);
            toStart.push(process);
          }
        }
      }

      // Actually start the processes
      if (toStart.length > 0) {
        for (const process of toStart) {
          applyProcess(process, stocks, true);
          runningProcesses.push({
            process,
            startTime: currentTime,
            endTime: currentTime + process.delay
          });
          stepLog.started.push(process.name);
        }
        processStarted = true;
      }
    } while (processStarted);

    stepLog.stocksAfter = { ...stocks };
    result.stepLogs.push(stepLog);

    // Check if we can continue
    if (runningProcesses.length === 0 && !processStarted) {
      break; // No more processes can run
    }

    currentTime++;
  }

  result.lastCycle = currentTime;
  result.finalStocks = { ...stocks };

  return result;
};
