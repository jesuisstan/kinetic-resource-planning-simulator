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
    const newQuantity = current - quantity;
    // Ensure resource doesn't go below 0
    newStocks.set(resource, Math.max(0, newQuantity));
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

  // Primary goal: maximize target resources
  for (const goal of config.optimizeGoals) {
    if (goal !== 'time') {
      const produced = (stocks.get(goal) || 0) - (initialStocks.get(goal) || 0);
      fitness += produced;
    }
  }

  // Add small bonus for executed processes
  fitness += executionLog.length * (optimizeTime ? 0.001 : 0.01);

  // Penalty for no execution
  if (fitness === 0 && executionLog.length === 0) {
    fitness = -1e9;
  }

  // Penalty for depleting critical resources
  const criticalResources = new Set<string>();
  for (const stock of config.stocks) {
    // If a resource is used by many processes or starts with 1, it's likely critical
    let usageCount = 0;
    for (const process of config.processes) {
      if (process.inputs.has(stock.name)) {
        usageCount++;
      }
    }
    // Only consider resources critical if they are used by many processes AND start with 1
    // OR if they are used by most processes (>80%) and start with 1
    // OR if they are used by ALL processes and start with 1 (special case like clock in inception)
    if (
      (usageCount > 2 && stock.quantity === 1) ||
      (usageCount > Math.floor(config.processes.length * 0.8) &&
        stock.quantity === 1) ||
      (usageCount === config.processes.length && stock.quantity === 1)
    ) {
      criticalResources.add(stock.name);
    }
  }

  for (const resource of criticalResources) {
    const finalAmount = stocks.get(resource) || 0;
    const initialAmount = initialStocks.get(resource) || 0;
    if (finalAmount < initialAmount) {
      // Heavy penalty for depleting critical resources
      fitness -= (initialAmount - finalAmount) * 1000;
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
