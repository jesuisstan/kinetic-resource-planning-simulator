import { Config, Process, SimulationResult, StockState } from './types';

// Pure function to check if a process can be started
export const canStartProcess = (
  process: Process,
  stocks: StockState
): boolean => {
  // Check immediate resources
  for (const [resource, required] of process.inputs) {
    const available = stocks.get(resource) || 0;
    if (available < required) {
      return false;
    }
  }
  return true;
};

// Pure function to update stocks after process
export const updateStocksAfterProcess = (
  process: Process,
  stocks: StockState
): StockState => {
  const newStocks = new Map(stocks);

  // Remove inputs
  for (const [resource, quantity] of process.inputs) {
    const current = newStocks.get(resource) || 0;
    newStocks.set(resource, current - quantity);
  }

  // Add outputs
  for (const [resource, quantity] of process.outputs) {
    const current = newStocks.get(resource) || 0;
    newStocks.set(resource, current + quantity);
  }

  return newStocks;
};

// Pure function to run simulation
export const runSimulation = (
  config: Config,
  processSequence: readonly string[],
  timeLimit: number
): SimulationResult => {
  const processMap = new Map(config.processes.map((p) => [p.name, p]));
  let stocks = new Map(config.stocks.map((s) => [s.name, s.quantity]));
  const initialStocks = new Map(stocks);
  let executionLog: Array<[number, string]> = [];
  let currentTime = 0;
  let timeoutReached = false;

  // Try to execute each process in sequence
  for (const processName of processSequence) {
    const process = processMap.get(processName);
    if (!process) continue;

    // Check if we can start the process
    if (!canStartProcess(process, stocks)) {
      continue;
    }

    // Check time limit
    if (currentTime + process.nbCycle > timeLimit) {
      timeoutReached = true;
      break;
    }

    // Start the process
    stocks = updateStocksAfterProcess(process, stocks);
    executionLog.push([currentTime, process.name]);
    currentTime += process.nbCycle;
  }

  // Calculate fitness
  let fitness = 0;
  const optimizeTime = config.optimizeGoals.includes('time');
  for (const goal of config.optimizeGoals) {
    if (goal !== 'time') {
      const produced = (stocks.get(goal) || 0) - (initialStocks.get(goal) || 0);
      fitness += produced;
    }
  }
  if (optimizeTime) {
    fitness /= 1.0 + currentTime;
  }

  return {
    finalStocks: stocks,
    executionLog,
    finalCycle: currentTime,
    fitness,
    timeoutReached
  };
};
