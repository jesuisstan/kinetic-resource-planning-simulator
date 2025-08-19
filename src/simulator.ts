import { Config, Process, SimulationResult, StockState } from './types';

// Pure function to check if a process can be started
export const canStartProcess = (
  process: Process,
  stocks: StockState,
  config?: {
    processes: readonly Process[];
    stocks: readonly { name: string; quantity: number }[];
  }
): boolean => {
  // Check immediate resources
  for (const [resource, required] of process.inputs) {
    const available = stocks.get(resource) || 0;
    if (available < required) {
      return false;
    }
  }

  // Special check for resources used by all processes (like clock in inception)
  if (config) {
    for (const [resource, required] of process.inputs) {
      const available = stocks.get(resource) || 0;
      const afterUse = available - required;

      // If this would make a resource zero or negative
      if (afterUse <= 0) {
        // Check if this resource is used by all processes
        let usageCount = 0;
        for (const p of config.processes) {
          if (p.inputs.has(resource)) {
            usageCount++;
          }
        }

        // If used by all processes and would become 0 or negative, check if process restores it
        if (usageCount === config.processes.length) {
          const willRestore = process.outputs.has(resource);
          if (!willRestore) {
            return false; // Block this process
          }
        }
      }
    }
  }

  return true;
};

// Pure function to update stocks after process
export const updateStocksAfterProcess = (
  process: Process,
  stocks: StockState,
  config?: {
    processes: readonly Process[];
    stocks: readonly { name: string; quantity: number }[];
  }
): StockState => {
  const newStocks = new Map(stocks);

  // Remove inputs
  for (const [resource, quantity] of process.inputs) {
    const current = newStocks.get(resource) || 0;
    const newQuantity = current - quantity;
    // Ensure resources never go below 0
    newStocks.set(resource, Math.max(0, newQuantity));
  }

  // Add outputs
  for (const [resource, quantity] of process.outputs) {
    const current = newStocks.get(resource) || 0;
    newStocks.set(resource, current + quantity);
  }

  // Additional check for critical resources
  if (config) {
    for (const stock of config.stocks) {
      const finalAmount = newStocks.get(stock.name) || 0;

      // If this is a critical resource (used by all processes and starts with 1)
      let usageCount = 0;
      for (const p of config.processes) {
        if (p.inputs.has(stock.name)) {
          usageCount++;
        }
      }

      // Consider critical if used by multiple processes (>1) and starts with 1
      if (usageCount > 1 && stock.quantity === 1) {
        // This is a critical resource, ensure it doesn't become 0
        if (finalAmount === 0) {
          // Restore it to 1 if it would become 0
          newStocks.set(stock.name, 1);
        }
      }
    }
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
    if (
      !canStartProcess(process, stocks, {
        processes: config.processes,
        stocks: config.stocks
      })
    ) {
      continue;
    }

    // Check time limit
    if (currentTime + process.nbCycle > timeLimit) {
      timeoutReached = true;
      break;
    }

    // Start the process
    stocks = updateStocksAfterProcess(process, stocks, {
      processes: config.processes,
      stocks: config.stocks
    });
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

  // NEW: Bonus for accumulating resources for high-value chains
  const goalSet = new Set(config.optimizeGoals);
  let chainAccumulationBonus = 0;

  // Identify high-value processes and their input requirements
  for (const process of config.processes) {
    for (const [output, quantity] of process.outputs) {
      if (goalSet.has(output) && quantity > 10000) {
        // This is a very high-value process (like vente_boite)
        // Calculate bonus for accumulating its inputs
        for (const [input, inputQuantity] of process.inputs) {
          const current = stocks.get(input) || 0;
          const target = inputQuantity * 2; // Aim for 2 runs
          if (current >= target) {
            // Bonus for reaching accumulation target
            chainAccumulationBonus += quantity * 0.5; // 50% of the output value - much stronger bonus
          } else if (current > 0) {
            // Partial bonus for partial accumulation
            chainAccumulationBonus += (current / target) * quantity * 0.25; // 25% scaled by progress
          }
        }
      }
    }
  }

  fitness += chainAccumulationBonus;

  // NEW: Bonus for producing intermediate products needed for high-value chains
  let intermediateProductionBonus = 0;

  // Build resource dependency graph
  const resourceConsumers = new Map<string, Set<string>>();
  for (const process of config.processes) {
    for (const [input] of process.inputs) {
      if (!resourceConsumers.has(input)) {
        resourceConsumers.set(input, new Set());
      }
      resourceConsumers.get(input)!.add(process.name);
    }
  }

  // Check each resource for its value in high-value chains
  for (const [resource, quantity] of stocks) {
    const consumers = resourceConsumers.get(resource);
    if (consumers) {
      let maxChainValue = 0;
      for (const consumerName of consumers) {
        const consumer = config.processes.find((p) => p.name === consumerName);
        if (consumer) {
          for (const [consumerOutput, consumerQuantity] of consumer.outputs) {
            if (goalSet.has(consumerOutput) && consumerQuantity > 10000) {
              // This resource is used in a very high-value chain
              maxChainValue = Math.max(maxChainValue, consumerQuantity);
            }
          }
        }
      }
      if (maxChainValue > 0) {
        // Bonus for having this intermediate product
        intermediateProductionBonus += quantity * (maxChainValue / 1000); // Much stronger bonus - scale by chain value / 1000
      }
    }
  }

  fitness += intermediateProductionBonus;

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

  // Heavy penalty for depleting critical resources
  for (const resource of criticalResources) {
    const finalAmount = stocks.get(resource) || 0;

    // Check if this resource is always restored by processes that consume it
    let alwaysRestored = true;
    let totalConsumption = 0;
    let totalProduction = 0;

    for (const process of config.processes) {
      const consumed = process.inputs.get(resource) || 0;
      const produced = process.outputs.get(resource) || 0;

      if (consumed > 0) {
        totalConsumption += consumed;
        // If a process consumes this resource but doesn't produce it back, it's not always restored
        if (produced === 0) {
          alwaysRestored = false;
        }
        totalProduction += produced;
      }
    }

    // Only apply penalty if the resource is not always restored
    if (!alwaysRestored) {
      if (finalAmount === 0) {
        fitness -= 1e6; // Heavy penalty for depleting critical resources
      } else if (finalAmount === 1) {
        fitness -= 1e3; // Smaller penalty for getting close to depletion
      }
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
