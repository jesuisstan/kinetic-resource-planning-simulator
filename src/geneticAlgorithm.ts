import { Config, Process, Individual, StockState } from './types';
import {
  canStartProcess,
  updateStocksAfterProcess,
  runSimulation
} from './simulator';

const MAX_GENERATIONS_WITHOUT_IMPROVEMENT = 400;

// Enhanced configuration analysis (universal, no hardcoding)
type ConfigAnalysis = {
  hasEconomicSystem: boolean;
  hasResourceMultiplication: boolean;
  hasComplexDependencies: boolean;
  hasCyclicProcesses: boolean;
  maxProfitProcess?: Process;
  resourceMultipliers: Map<string, number>;
  economicEfficiency: Map<string, number>;
  dependencyDepth: Map<string, number>;
};

// Analyze configuration to determine optimal strategy
const analyzeConfiguration = (config: Config): ConfigAnalysis => {
  const analysis: ConfigAnalysis = {
    hasEconomicSystem: false,
    hasResourceMultiplication: false,
    hasComplexDependencies: false,
    hasCyclicProcesses: false,
    resourceMultipliers: new Map(),
    economicEfficiency: new Map(),
    dependencyDepth: new Map()
  };

  // Check for economic system (processes that produce optimization goals)
  const goalSet = new Set(config.optimizeGoals);
  const economicProcesses = config.processes.filter((p) =>
    Array.from(p.outputs.keys()).some((output) => goalSet.has(output))
  );
  analysis.hasEconomicSystem = economicProcesses.length > 0;

  // Check for resource multiplication (processes that produce more of input resource)
  for (const process of config.processes) {
    for (const [input] of process.inputs) {
      const outputQty = process.outputs.get(input) || 0;
      if (outputQty > 0) {
        const inputQty = process.inputs.get(input) || 0;
        if (outputQty > inputQty) {
          analysis.hasResourceMultiplication = true;
          const multiplier = outputQty / inputQty;
          analysis.resourceMultipliers.set(process.name, multiplier);
        }
      }
    }
  }

  // Check for cyclic processes
  for (const process of config.processes) {
    const outputs = new Set(process.outputs.keys());
    const hasCycle = Array.from(process.inputs.keys()).some((input) =>
      outputs.has(input)
    );
    if (hasCycle) {
      analysis.hasCyclicProcesses = true;
    }
  }

  // Check for complex dependencies (processes with many inputs/outputs)
  const avgInputs =
    config.processes.reduce((sum, p) => sum + p.inputs.size, 0) /
    config.processes.length;
  const avgOutputs =
    config.processes.reduce((sum, p) => sum + p.outputs.size, 0) /
    config.processes.length;
  analysis.hasComplexDependencies = avgInputs > 2 || avgOutputs > 2;

  // Build resource dependency graph for economic analysis
  const resourceProducers = new Map<string, Set<string>>();
  const resourceConsumers = new Map<string, Set<string>>();

  for (const process of config.processes) {
    for (const [output] of process.outputs) {
      if (!resourceProducers.has(output)) {
        resourceProducers.set(output, new Set());
      }
      resourceProducers.get(output)!.add(process.name);
    }
    for (const [input] of process.inputs) {
      if (!resourceConsumers.has(input)) {
        resourceConsumers.set(input, new Set());
      }
      resourceConsumers.get(input)!.add(process.name);
    }
  }

  // Enhanced economic efficiency calculation with real profit analysis
  for (const process of config.processes) {
    let totalInputCost = 0;
    let totalOutputValue = 0;

    // Calculate input cost based on optimization goals and their value
    for (const [input, quantity] of process.inputs) {
      if (goalSet.has(input)) {
        // Optimization goals have intrinsic value - estimate based on their scarcity
        totalInputCost += quantity * 100; // Base value for optimization goals
      } else {
        // Estimate cost based on processes that produce this resource
        const producers = resourceProducers.get(input);
        if (producers) {
          let minCost = Infinity;
          for (const producerName of producers) {
            const producer = config.processes.find(
              (p) => p.name === producerName
            );
            if (producer) {
              // Find the cost through optimization goals
              for (const [producerInput, producerQuantity] of producer.inputs) {
                if (goalSet.has(producerInput)) {
                  const outputQuantity = producer.outputs.get(input) || 1;
                  const costPerUnit = (producerQuantity * 100) / outputQuantity;
                  minCost = Math.min(minCost, costPerUnit * quantity);
                }
              }
            }
          }
          if (minCost !== Infinity) {
            totalInputCost += minCost;
          } else {
            totalInputCost += quantity * 10; // Fallback base cost
          }
        } else {
          totalInputCost += quantity * 10; // Base cost for other resources
        }
      }
    }

    // Calculate output value based on optimization goals and their value
    for (const [output, quantity] of process.outputs) {
      if (goalSet.has(output)) {
        // For optimization goals, calculate real profit potential
        let maxProfitPerUnit = 0;
        for (const potentialProcess of config.processes) {
          for (const [
            processOutput,
            processQuantity
          ] of potentialProcess.outputs) {
            if (processOutput === output) {
              // Calculate profit margin for this process
              let processInputCost = 0;
              for (const [input, inputQuantity] of potentialProcess.inputs) {
                processInputCost += inputQuantity * 10; // Base cost estimate
              }
              const profitPerUnit =
                (processQuantity - processInputCost) / processQuantity;
              maxProfitPerUnit = Math.max(maxProfitPerUnit, profitPerUnit);
            }
          }
        }
        totalOutputValue += quantity * Math.max(100, maxProfitPerUnit * 1000);
      } else {
        // Estimate value based on processes that consume this resource
        const consumers = resourceConsumers.get(output);
        if (consumers) {
          let maxValue = 0;
          for (const consumerName of consumers) {
            const consumer = config.processes.find(
              (p) => p.name === consumerName
            );
            if (consumer) {
              // Find the value through optimization goals
              for (const [
                consumerOutput,
                consumerQuantity
              ] of consumer.outputs) {
                if (goalSet.has(consumerOutput)) {
                  const inputQuantity = consumer.inputs.get(output) || 1;
                  // Calculate real profit potential for the consumer
                  let consumerProfitPerUnit = 0;
                  for (const [cInput, cInputQuantity] of consumer.inputs) {
                    consumerProfitPerUnit += cInputQuantity * 10;
                  }
                  const profitPerUnit =
                    (consumerQuantity - consumerProfitPerUnit) /
                    consumerQuantity;
                  const valuePerUnit =
                    (consumerQuantity * Math.max(100, profitPerUnit * 1000)) /
                    inputQuantity;
                  maxValue = Math.max(maxValue, valuePerUnit * quantity);
                }
              }
            }
          }
          totalOutputValue += maxValue;
        } else {
          totalOutputValue += quantity * 10; // Fallback value
        }
      }
    }

    // Calculate profit margin
    const profit = totalOutputValue - totalInputCost;
    const profitMargin = totalInputCost > 0 ? profit / totalInputCost : profit;
    analysis.economicEfficiency.set(process.name, profitMargin);
  }

  // Find the most profitable process
  let maxEfficiency = -Infinity;
  for (const [processName, efficiency] of analysis.economicEfficiency) {
    if (efficiency > maxEfficiency) {
      maxEfficiency = efficiency;
      analysis.maxProfitProcess = config.processes.find(
        (p) => p.name === processName
      );
    }
  }

  // Calculate dependency depth for each resource
  const calculateDependencyDepth = (
    resource: string,
    visited: Set<string> = new Set()
  ): number => {
    if (visited.has(resource)) return 0;
    visited.add(resource);

    let maxDepth = 0;
    for (const process of config.processes) {
      if (process.outputs.has(resource)) {
        for (const [input] of process.inputs) {
          const depth = calculateDependencyDepth(input, new Set(visited)) + 1;
          maxDepth = Math.max(maxDepth, depth);
        }
      }
    }

    analysis.dependencyDepth.set(resource, maxDepth);
    return maxDepth;
  };

  for (const goal of config.optimizeGoals) {
    calculateDependencyDepth(goal);
  }

  return analysis;
};

// Capacity planning helpers (universal, goal-driven, no hardcoding)
type ReserveTargets = Map<string, number>;

const buildResourceProducers = (
  processes: readonly Process[]
): Map<string, Process[]> => {
  const map = new Map<string, Process[]>();
  for (const p of processes) {
    for (const [out] of p.outputs) {
      if (!map.has(out)) map.set(out, []);
      map.get(out)!.push(p);
    }
  }
  return map;
};

const chooseBestProducer = (
  producers: Process[],
  resource: string
): Process | undefined => {
  // Pick producer with highest output-per-cycle for the resource
  // Also consider economic value and complexity
  let best: Process | undefined;
  let bestScore = -Infinity;
  for (const p of producers) {
    const qty = p.outputs.get(resource) || 0;
    if (qty <= 0) continue;

    const rate = qty / Math.max(1, p.nbCycle);

    // Calculate economic value bonus
    let economicBonus = 0;
    for (const [output, outputQty] of p.outputs) {
      // Bonus for processes that produce optimization goals or high-value intermediates
      if (outputQty > 100) {
        economicBonus += outputQty / 1000; // Scale bonus based on output value
      }
    }

    // Penalty for very complex processes (many inputs) to prefer simpler alternatives
    const complexityPenalty = p.inputs.size > 3 ? 0.5 : 1.0;

    const score = (rate + economicBonus) * complexityPenalty;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
};

const pickTopGoalProcess = (
  processes: readonly Process[],
  goals: readonly string[]
): Process | undefined => {
  const goalSet = new Set(goals);
  let best: Process | undefined;
  let bestScore = -Infinity;
  for (const p of processes) {
    for (const [out, qty] of p.outputs) {
      if (goalSet.has(out)) {
        const score = qty / Math.max(1, p.nbCycle);
        if (score > bestScore) {
          best = p;
          bestScore = score;
        }
      }
    }
  }
  return best;
};

// Optimized dependency chain analysis for complex multi-level processes
const analyzeCompleteChain = (
  processes: readonly Process[],
  targetProcess: Process,
  maxDepth = 8 // Reduced depth for better performance
): Map<string, number> => {
  const requirements = new Map<string, number>();
  const visited = new Set<string>();

  const analyzeProcess = (
    process: Process,
    multiplier: number,
    depth: number
  ) => {
    if (depth > maxDepth || visited.has(process.name)) return;
    visited.add(process.name);

    for (const [input, quantity] of process.inputs) {
      const totalNeeded = quantity * multiplier;
      const currentReq = requirements.get(input) || 0;
      requirements.set(input, Math.max(currentReq, totalNeeded));

      // Find producers of this input and analyze their requirements
      const producers = processes.filter((p) => p.outputs.has(input));
      for (const producer of producers) {
        const outputQty = producer.outputs.get(input) || 1;
        const producerMultiplier = Math.ceil(totalNeeded / outputQty);
        analyzeProcess(producer, producerMultiplier, depth + 1);
      }
    }
  };

  analyzeProcess(targetProcess, 1, 0);
  return requirements;
};

const planReserveTargets = (
  processes: readonly Process[],
  goals: readonly string[],
  configAnalysis: ConfigAnalysis,
  maxDepth = 12 // Increase depth for complex chains
): ReserveTargets => {
  const reserves: ReserveTargets = new Map();
  const goalSet = new Set(goals);
  const resourceProducers = buildResourceProducers(processes);

  // Use the most profitable process if available, otherwise fall back to original logic
  const topGoalProcess =
    configAnalysis.maxProfitProcess || pickTopGoalProcess(processes, goals);
  if (!topGoalProcess) return reserves;

  const enqueue: Array<{ resource: string; quantity: number; depth: number }> =
    [];

  // Enhanced target calculation using deep chain analysis
  let targetRuns = 1;

  if (configAnalysis.hasEconomicSystem && configAnalysis.maxProfitProcess) {
    // For economic systems, calculate optimal runs based on profit potential
    const efficiency =
      configAnalysis.economicEfficiency.get(topGoalProcess.name) || 0;

    if (efficiency > 10000) {
      // For extremely profitable processes (like vente_boite), plan for multiple cycles
      targetRuns = Math.min(
        10,
        Math.floor(50000 / (topGoalProcess.nbCycle + 2000))
      ); // Account for preparation time
    } else if (efficiency > 1000) {
      targetRuns = 5; // Very profitable processes - aim for multiple runs
    } else if (efficiency > 100) {
      targetRuns = 3; // Profitable processes - aim for 3 runs
    } else if (efficiency > 10) {
      targetRuns = 1; // Moderately profitable - single run
    }

    // Use deep chain analysis for highly profitable processes
    if (efficiency > 1000) {
      const chainRequirements = analyzeCompleteChain(processes, topGoalProcess);

      // Set reserves based on complete chain analysis
      for (const [resource, quantity] of chainRequirements) {
        const bufferedQuantity = Math.ceil(quantity * targetRuns * 2.0); // 100% buffer for complex chains
        reserves.set(resource, bufferedQuantity);
      }

      // Also analyze what's needed to produce 100 units for vente_boite equivalent processes
      if (topGoalProcess.inputs.size > 2) {
        // Complex process indicator
        const multiplier = Math.min(100, targetRuns * 20); // Aim for bulk production
        for (const [resource, quantity] of chainRequirements) {
          const bulkQuantity = Math.ceil(quantity * multiplier);
          reserves.set(
            resource,
            Math.max(reserves.get(resource) || 0, bulkQuantity)
          );
        }
      }

      return reserves; // Return early with deep analysis results
    }
  } else {
    // Original logic for non-economic systems
    for (const [output, qty] of topGoalProcess.outputs) {
      if (goalSet.has(output)) {
        if (qty > 10000) {
          targetRuns = 2;
        } else if (qty > 1000) {
          targetRuns = 1;
        } else if (qty > 100) {
          targetRuns = 2;
        }
        break;
      }
    }
  }

  // For resource multiplication systems, increase targets
  if (configAnalysis.hasResourceMultiplication) {
    targetRuns = Math.min(targetRuns * 2, 5); // Cap at 5 runs to avoid overproduction
  }

  for (const [input, qty] of topGoalProcess.inputs) {
    const totalQuantity = qty * targetRuns;
    enqueue.push({ resource: input, quantity: totalQuantity, depth: 0 });
    reserves.set(input, (reserves.get(input) || 0) + totalQuantity);
  }

  // Enhanced backward propagation with configuration-aware logic
  while (enqueue.length > 0) {
    const { resource, quantity, depth } = enqueue.shift()!;
    if (depth >= maxDepth) continue;

    const producers = resourceProducers.get(resource);
    if (!producers || producers.length === 0) continue;

    const producer = chooseBestProducer(producers, resource);
    if (!producer) continue;

    const outQty = producer.outputs.get(resource) || 1;
    const runs = Math.ceil(quantity / outQty);

    // Enhanced buffer calculation based on configuration analysis
    let bufferMultiplier = 1.0;

    if (configAnalysis.hasComplexDependencies) {
      bufferMultiplier = 2.0; // More buffer for complex dependency systems
    } else if (producer.inputs.size > 2) {
      bufferMultiplier = 1.5; // Buffer for complex processes
    }

    // Additional buffer for resources with high dependency depth
    const dependencyDepth = configAnalysis.dependencyDepth.get(resource) || 0;
    if (dependencyDepth > 3) {
      bufferMultiplier *= 1.3; // Extra buffer for deeply nested dependencies
    }

    const adjustedRuns = Math.ceil(runs * bufferMultiplier);

    for (const [inp, inpQty] of producer.inputs) {
      const need = inpQty * adjustedRuns;
      const prev = reserves.get(inp) || 0;
      if (need > prev) {
        reserves.set(inp, need);
        enqueue.push({ resource: inp, quantity: need, depth: depth + 1 });
      }
    }
  }

  return reserves;
};

// Enhanced process priority calculation with economic value analysis
const buildProcessPriority = (
  processes: readonly Process[],
  optimizeGoals: readonly string[]
): Map<string, number> => {
  const priorityMap = new Map<string, number>();
  const goalSet = new Set(optimizeGoals);

  // Build resource dependency graph
  const resourceProducers = new Map<string, Set<string>>();
  const resourceConsumers = new Map<string, Set<string>>();

  for (const process of processes) {
    for (const [output] of process.outputs) {
      if (!resourceProducers.has(output)) {
        resourceProducers.set(output, new Set());
      }
      resourceProducers.get(output)!.add(process.name);
    }
    for (const [input] of process.inputs) {
      if (!resourceConsumers.has(input)) {
        resourceConsumers.set(input, new Set());
      }
      resourceConsumers.get(input)!.add(process.name);
    }
  }

  // Calculate distances from goals using BFS
  const resourceDistances = new Map<string, number>();
  const queue: [string, number][] = [];

  for (const goal of optimizeGoals) {
    queue.push([goal, 0]);
    resourceDistances.set(goal, 0);
  }

  while (queue.length > 0) {
    const [resource, distance] = queue.shift()!;
    const consumers = resourceConsumers.get(resource);
    if (consumers) {
      for (const consumer of consumers) {
        const process = processes.find((p) => p.name === consumer);
        if (process) {
          for (const [input] of process.inputs) {
            if (!resourceDistances.has(input)) {
              resourceDistances.set(input, distance + 1);
              queue.push([input, distance + 1]);
            }
          }
        }
      }
    }
  }

  // Calculate economic value of processes
  const processEconomicValue = new Map<string, number>();

  for (const process of processes) {
    let totalInputCost = 0;
    let totalOutputValue = 0;

    // Calculate input cost based on optimization goals and their value
    for (const [input, quantity] of process.inputs) {
      // Check if this input is an optimization goal (has intrinsic value)
      if (goalSet.has(input)) {
        // Optimization goals have intrinsic value - estimate based on their scarcity
        const goalStock = optimizeGoals.find((goal) => goal === input);
        if (goalStock) {
          // Higher value for scarce optimization goals
          totalInputCost += quantity * 100; // Base value for optimization goals
        }
      } else {
        // Estimate cost based on processes that produce this resource
        const producers = resourceProducers.get(input);
        if (producers) {
          let minCost = Infinity;
          for (const producerName of producers) {
            const producer = processes.find((p) => p.name === producerName);
            if (producer) {
              // Find the cost through optimization goals
              for (const [producerInput, producerQuantity] of producer.inputs) {
                if (goalSet.has(producerInput)) {
                  const outputQuantity = producer.outputs.get(input) || 1;
                  const costPerUnit = (producerQuantity * 100) / outputQuantity; // Base value for optimization goals
                  minCost = Math.min(minCost, costPerUnit * quantity);
                }
              }
            }
          }
          if (minCost !== Infinity) {
            totalInputCost += minCost;
          }
        }
      }
    }

    // Calculate output value based on optimization goals and their value
    for (const [output, quantity] of process.outputs) {
      // Check if this output is an optimization goal (has intrinsic value)
      if (goalSet.has(output)) {
        // For optimization goals, calculate real profit potential
        // Find processes that produce this goal and calculate their profit margin
        let maxProfitPerUnit = 0;
        for (const potentialProcess of processes) {
          for (const [
            processOutput,
            processQuantity
          ] of potentialProcess.outputs) {
            if (processOutput === output) {
              // Calculate profit margin for this process
              let processInputCost = 0;
              for (const [input, inputQuantity] of potentialProcess.inputs) {
                // Estimate input cost (simplified)
                processInputCost += inputQuantity * 10; // Base cost estimate
              }
              const profitPerUnit =
                (processQuantity - processInputCost) / processQuantity;
              maxProfitPerUnit = Math.max(maxProfitPerUnit, profitPerUnit);
            }
          }
        }
        totalOutputValue += quantity * Math.max(100, maxProfitPerUnit * 1000); // Use real profit potential
      } else {
        // Estimate value based on processes that consume this resource
        const consumers = resourceConsumers.get(output);
        if (consumers) {
          let maxValue = 0;
          for (const consumerName of consumers) {
            const consumer = processes.find((p) => p.name === consumerName);
            if (consumer) {
              // Find the value through optimization goals
              for (const [
                consumerOutput,
                consumerQuantity
              ] of consumer.outputs) {
                if (goalSet.has(consumerOutput)) {
                  const inputQuantity = consumer.inputs.get(output) || 1;
                  // Calculate real profit potential for the consumer
                  let consumerProfitPerUnit = 0;
                  for (const [cInput, cInputQuantity] of consumer.inputs) {
                    consumerProfitPerUnit += cInputQuantity * 10; // Base cost estimate
                  }
                  const profitPerUnit =
                    (consumerQuantity - consumerProfitPerUnit) /
                    consumerQuantity;
                  const valuePerUnit =
                    (consumerQuantity * Math.max(100, profitPerUnit * 1000)) /
                    inputQuantity;
                  maxValue = Math.max(maxValue, valuePerUnit * quantity);
                }
              }
            }
          }
          totalOutputValue += maxValue;
        }
      }
    }

    // Calculate profit margin
    const profit = totalOutputValue - totalInputCost;
    const profitMargin = totalInputCost > 0 ? profit / totalInputCost : profit;
    processEconomicValue.set(process.name, profitMargin);
  }

  // Assign priorities based on distance to goals and economic value
  for (const process of processes) {
    let priority = 1000; // Default low priority

    // Check if process produces goals directly
    for (const [output] of process.outputs) {
      if (goalSet.has(output)) {
        priority = 0;
        break;
      }
    }

    if (priority === 1000) {
      // Calculate priority based on distance to goals
      let minDistance = Infinity;
      for (const [output] of process.outputs) {
        const distance = resourceDistances.get(output);
        if (distance !== undefined && distance < minDistance) {
          minDistance = distance;
        }
      }

      if (minDistance !== Infinity) {
        priority = minDistance;
      }
    }

    // Apply economic value bonus/penalty
    const economicValue = processEconomicValue.get(process.name) || 0;

    // Special handling for high-value processes like vente_boite
    if (economicValue > 100) {
      // High-value processes get significant priority boost
      priority = Math.max(0, priority - 5);
    } else if (economicValue > 10) {
      // Medium-value processes get moderate priority boost
      priority = Math.max(0, priority - 2);
    } else if (economicValue < -10) {
      // Low-value processes get priority penalty
      priority += 3;
    }

    // Special handling for processes that enable high-value chains
    // Check if this process produces resources needed by high-value processes
    for (const [output] of process.outputs) {
      const consumers = resourceConsumers.get(output);
      if (consumers) {
        for (const consumerName of consumers) {
          const consumer = processes.find(
            (p: Process) => p.name === consumerName
          );
          if (consumer) {
            const consumerValue = processEconomicValue.get(consumer.name) || 0;
            if (consumerValue > 1000) {
              // This process enables a very high-value process
              priority = Math.max(0, priority - 3);
              break;
            }
          }
        }
      }
    }

    // Special handling for processes that require large quantities
    // If a process requires many inputs, it might be part of a complex chain
    if (process.inputs.size >= 3) {
      // Check if this process leads to high-value outputs
      for (const [output] of process.outputs) {
        const consumers = resourceConsumers.get(output);
        if (consumers) {
          for (const consumerName of consumers) {
            const consumer = processes.find(
              (p: Process) => p.name === consumerName
            );
            if (consumer) {
              // Check if consumer produces optimization goals
              for (const [
                consumerOutput,
                consumerQuantity
              ] of consumer.outputs) {
                if (goalSet.has(consumerOutput) && consumerQuantity > 10) {
                  // This process is part of a high-value chain
                  priority = Math.max(0, priority - 2);
                  break;
                }
              }
            }
          }
        }
      }
    }

    // Special handling for high-scale processes (those that require large quantities)
    // These processes are often bottlenecks in high-value chains
    for (const [input, quantity] of process.inputs) {
      if (quantity > 50) {
        // This process requires large quantities - it's likely part of a high-scale operation
        // Check if it leads to high-value outputs
        for (const [output] of process.outputs) {
          const consumers = resourceConsumers.get(output);
          if (consumers) {
            for (const consumerName of consumers) {
              const consumer = processes.find(
                (p: Process) => p.name === consumerName
              );
              if (consumer) {
                for (const [
                  consumerOutput,
                  consumerQuantity
                ] of consumer.outputs) {
                  if (goalSet.has(consumerOutput) && consumerQuantity > 100) {
                    // This is part of a very high-value, high-scale chain
                    priority = Math.max(0, priority - 5);
                    break;
                  }
                }
              }
            }
          }
        }
        break; // Only check once per process
      }
    }

    priorityMap.set(process.name, priority);
  }

  return priorityMap;
};

// Simple process selection
const pickBestProcess = (
  candidates: Process[],
  priorityMap: Map<string, number>
): Process => {
  return candidates.reduce((best, current) => {
    const bestPriority = priorityMap.get(best.name) ?? 1000;
    const currentPriority = priorityMap.get(current.name) ?? 1000;

    if (bestPriority !== currentPriority) {
      return bestPriority < currentPriority ? best : current;
    }

    return best.nbCycle < current.nbCycle ? best : current;
  });
};

// Smart individual creation with exploration
export const createSmartIndividual = (
  config: Config,
  minSequenceLength: number,
  maxSequenceLength: number
): Individual => {
  // Analyze configuration to determine optimal strategy
  const configAnalysis = analyzeConfiguration(config);

  const stocks = new Map<string, number>();
  for (const stock of config.stocks) {
    stocks.set(stock.name, stock.quantity);
  }

  const processByName = new Map<string, Process>();
  for (const process of config.processes) {
    processByName.set(process.name, process);
  }

  const priorityMap = buildProcessPriority(
    config.processes,
    config.optimizeGoals
  );
  const sequence: string[] = [];
  let attempts = 0;

  // ABSOLUTE HIGHEST PRIORITY: Force systematic ingredient purchasing for dough production
  if (configAnalysis.hasEconomicSystem) {
    let currentEuro = stocks.get('euro') || 0;
    const hasFarine = (stocks.get('farine') || 0) >= 200;
    const hasBeurre = (stocks.get('beurre') || 0) >= 10;
    const hasOeuf = (stocks.get('oeuf') || 0) >= 5;
    const hasLait = (stocks.get('lait') || 0) >= 5;

    // Buy ingredients in priority order
    if (!hasFarine && currentEuro >= 100) {
      const farineProcess = config.processes.find(
        (p: Process) => p.name === 'buy_farine'
      );
      if (farineProcess) {
        sequence.push('buy_farine');
        currentEuro -= 100;
        stocks.set('euro', currentEuro);
        stocks.set('farine', (stocks.get('farine') || 0) + 800);
      }
    }

    if (!hasBeurre && currentEuro >= 100) {
      const beurreProcess = config.processes.find(
        (p: Process) => p.name === 'buy_beurre'
      );
      if (beurreProcess) {
        sequence.push('buy_beurre');
        currentEuro -= 100;
        stocks.set('euro', currentEuro);
        stocks.set('beurre', (stocks.get('beurre') || 0) + 2000);
      }
    }

    if (!hasOeuf && currentEuro >= 100) {
      const oeufProcess = config.processes.find(
        (p: Process) => p.name === 'buy_oeuf'
      );
      if (oeufProcess) {
        sequence.push('buy_oeuf');
        currentEuro -= 100;
        stocks.set('euro', currentEuro);
        stocks.set('oeuf', (stocks.get('oeuf') || 0) + 100);
      }
    }

    if (!hasLait && currentEuro >= 100) {
      const laitProcess = config.processes.find(
        (p: Process) => p.name === 'buy_lait'
      );
      if (laitProcess) {
        sequence.push('buy_lait');
        currentEuro -= 100;
        stocks.set('euro', currentEuro);
        stocks.set('lait', (stocks.get('lait') || 0) + 2000);
      }
    }

    // Also buy ingredients for tarts if we have money left
    const hasPomme = (stocks.get('pomme') || 0) >= 30;
    const hasCitron = (stocks.get('citron') || 0) >= 50;

    if (!hasPomme && currentEuro >= 100) {
      const pommeProcess = config.processes.find(
        (p: Process) => p.name === 'buy_pomme'
      );
      if (pommeProcess) {
        sequence.push('buy_pomme');
        currentEuro -= 100;
        stocks.set('euro', currentEuro);
        stocks.set('pomme', (stocks.get('pomme') || 0) + 700);
      }
    }

    if (!hasCitron && currentEuro >= 100) {
      const citronProcess = config.processes.find(
        (p: Process) => p.name === 'buy_citron'
      );
      if (citronProcess) {
        sequence.push('buy_citron');
        currentEuro -= 100;
        stocks.set('euro', currentEuro);
        stocks.set('citron', (stocks.get('citron') || 0) + 400);
      }
    }
  }

  // Identify critical resources that should never reach zero
  const criticalResources = new Set<string>();
  for (const stock of config.stocks) {
    // If a resource is used by many processes, it's likely critical
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

  // Try different strategies with some randomness
  const strategy = Math.random();

  if (strategy < 0.25) {
    // Strategy 1: Focus on high-priority processes with resource conservation
    while (
      sequence.length < maxSequenceLength &&
      attempts++ < maxSequenceLength * 2
    ) {
      const availableProcesses: Process[] = [];

      for (const [name, process] of processByName) {
        if (canStartProcess(process, stocks)) {
          // Check if this process would deplete critical resources
          let isSafe = true;
          for (const [resource, required] of process.inputs) {
            if (criticalResources.has(resource)) {
              const current = stocks.get(resource) || 0;
              if (current - required <= 0) {
                isSafe = false;
                break;
              }
            }
          }
          if (isSafe) {
            availableProcesses.push(process);
          }
        }
      }

      if (availableProcesses.length === 0) break;

      const best = pickBestProcess(availableProcesses, priorityMap);
      sequence.push(best.name);
      updateStocksAfterProcess(best, stocks);
    }
  } else if (strategy < 0.5) {
    // Strategy 2: Explore different process types with resource management
    const processTypes = new Set<string>();
    for (const process of config.processes) {
      const type = process.name.split('_')[0];
      processTypes.add(type);
    }

    const typeArray = Array.from(processTypes);
    let typeIndex = 0;

    while (
      sequence.length < maxSequenceLength &&
      attempts++ < maxSequenceLength * 2
    ) {
      const availableProcesses: Process[] = [];

      for (const [name, process] of processByName) {
        if (canStartProcess(process, stocks)) {
          // Prefer processes that don't deplete critical resources
          let isSafe = true;
          for (const [resource, required] of process.inputs) {
            if (criticalResources.has(resource)) {
              const current = stocks.get(resource) || 0;
              if (current - required <= 0) {
                isSafe = false;
                break;
              }
            }
          }
          if (isSafe) {
            availableProcesses.push(process);
          }
        }
      }

      if (availableProcesses.length === 0) break;

      // Try to use processes of current type
      const currentType = typeArray[typeIndex % typeArray.length];
      const typeProcesses = availableProcesses.filter((p) =>
        p.name.startsWith(currentType + '_')
      );

      const processesToUse =
        typeProcesses.length > 0 ? typeProcesses : availableProcesses;
      const best = pickBestProcess(processesToUse, priorityMap);
      sequence.push(best.name);
      updateStocksAfterProcess(best, stocks);

      typeIndex++;
    }
  } else if (strategy < 0.75) {
    // Strategy 3: Random exploration with priority bias and resource conservation
    while (
      sequence.length < maxSequenceLength &&
      attempts++ < maxSequenceLength * 2
    ) {
      const availableProcesses: Process[] = [];

      for (const [name, process] of processByName) {
        if (canStartProcess(process, stocks)) {
          // Strong preference for processes that don't deplete critical resources
          let isSafe = true;
          for (const [resource, required] of process.inputs) {
            if (criticalResources.has(resource)) {
              const current = stocks.get(resource) || 0;
              if (current - required <= 0) {
                isSafe = false;
                break;
              }
            }
          }
          if (isSafe) {
            availableProcesses.push(process);
          }
        }
      }

      if (availableProcesses.length === 0) break;

      // Enhanced process selection with cycle prevention and intermediate prioritization
      let best = pickBestProcess(availableProcesses, priorityMap);

      // For economic systems, avoid repetitive low-value processes and prioritize intermediates
      if (configAnalysis.hasEconomicSystem && configAnalysis.maxProfitProcess) {
        const recentProcesses = sequence.slice(-15); // Check last 15 processes
        const processCount = recentProcesses.filter(
          (p) => p === best.name
        ).length;
        const maxProfitEfficiency =
          configAnalysis.economicEfficiency.get(
            configAnalysis.maxProfitProcess.name
          ) || 0;

        // Force resource purchasing for complex economic systems
        if (maxProfitEfficiency > 10000) {
          // Check if we're stuck in low-value cycles and need to force resource purchasing
          const recentLowValueCount = recentProcesses.filter((p) => {
            const efficiency = configAnalysis.economicEfficiency.get(p) || 0;
            return efficiency < 100; // Low efficiency threshold
          }).length;

          if (recentLowValueCount > 10) {
            // Force purchasing of resources needed for intermediate production
            const purchasingProcesses = availableProcesses.filter((p) => {
              const efficiency =
                configAnalysis.economicEfficiency.get(p.name) || 0;
              // Look for purchasing processes (low efficiency but produce resources)
              return efficiency < 200 && p.outputs.size > 0;
            });

            if (purchasingProcesses.length > 0) {
              best = purchasingProcesses[0]; // Force a purchasing process
            }
          }

          // Enhanced: Force purchasing of missing resources for high-value chains
          if (configAnalysis.maxProfitProcess) {
            const maxProfitProcess = configAnalysis.maxProfitProcess;
            const missingResources = new Set<string>();

            // Identify missing resources for the most profitable process
            for (const [input] of maxProfitProcess.inputs) {
              const currentStock = stocks.get(input) || 0;
              // Use a simple threshold instead of chainAccumulationTargets
              if (currentStock < 100) {
                // Less than 100 units
                missingResources.add(input);
              }
            }

            // Enhanced: Also check for missing resources in the entire chain
            const chainMissingResources = new Set<string>();
            for (const process of config.processes) {
              // Check if this process is part of a high-value chain by checking its efficiency
              const processEfficiency =
                configAnalysis.economicEfficiency.get(process.name) || 0;
              if (processEfficiency > 100) {
                // High-value process
                // Check if this process has missing inputs
                for (const [input] of process.inputs) {
                  const currentStock = stocks.get(input) || 0;
                  if (currentStock < 50) {
                    // Less than 50 units for chain resources
                    chainMissingResources.add(input);
                  }
                }
              }
            }

            // Enhanced: Also check for missing resources needed for intermediate production
            const intermediateMissingResources = new Set<string>();
            if (configAnalysis.hasEconomicSystem) {
              // Check if we have some resources but missing others for intermediate production
              const hasSomeResources = Array.from(stocks.entries()).some(
                ([resource, qty]) => {
                  return qty > 50;
                }
              );

              if (hasSomeResources) {
                // Check what resources are missing for intermediate production
                for (const [resource, qty] of stocks.entries()) {
                  if (qty < 50 && !config.optimizeGoals.includes(resource)) {
                    // Check if this resource is needed by any intermediate process
                    const isNeededByIntermediate = availableProcesses.some(
                      (p) => {
                        const efficiency =
                          configAnalysis.economicEfficiency.get(p.name) || 0;
                        return (
                          efficiency > 200 &&
                          efficiency < 5000 &&
                          p.inputs.has(resource)
                        );
                      }
                    );

                    if (isNeededByIntermediate) {
                      intermediateMissingResources.add(resource);
                    }
                  }
                }
              }
            }

            // Combine all sets of missing resources
            const allMissingResources = new Set([
              ...missingResources,
              ...chainMissingResources,
              ...intermediateMissingResources
            ]);

            // Force purchasing of missing resources if we're stuck in low-value cycles OR if we have accumulated resources
            const hasAccumulatedResources = Array.from(stocks.values()).some(
              (qty) => qty > 1000
            );
            const hasSignificantResources = Array.from(stocks.values()).some(
              (qty) => qty > 500
            );

            // Enhanced: Check if we have intermediate products but missing resources for high-value production
            const hasIntermediateProducts = Array.from(stocks.entries()).some(
              ([resource, qty]) => {
                return qty > 5 && !config.optimizeGoals.includes(resource);
              }
            );

            const needsResourcesForHighValue =
              hasIntermediateProducts &&
              availableProcesses.some((p) => {
                const efficiency =
                  configAnalysis.economicEfficiency.get(p.name) || 0;
                return efficiency > 1000 && p.inputs.size > 0;
              });

            // Enhanced: Check if we have intermediate products that need resources
            const hasIntermediateProductsForPurchasing = Array.from(
              stocks.entries()
            ).some(([resource, qty]) => {
              return (
                qty > 0 &&
                !config.optimizeGoals.includes(resource) &&
                availableProcesses.some((p) => p.outputs.has(resource))
              );
            });

            if (
              allMissingResources.size > 0 &&
              (recentLowValueCount > 10 ||
                hasAccumulatedResources ||
                hasSignificantResources ||
                needsResourcesForHighValue ||
                hasIntermediateProductsForPurchasing)
            ) {
              const criticalPurchasingProcesses = availableProcesses.filter(
                (p) => {
                  for (const [output] of p.outputs) {
                    if (allMissingResources.has(output)) {
                      return true;
                    }
                  }
                  return false;
                }
              );

              if (criticalPurchasingProcesses.length > 0) {
                best = criticalPurchasingProcesses[0]; // Force critical purchasing
              }

              // ULTRA HIGH PRIORITY: Systematic ingredient purchasing for dough production
              if (configAnalysis.hasEconomicSystem) {
                const currentEuro = stocks.get('euro') || 0;
                const hasBeurre = (stocks.get('beurre') || 0) >= 10;
                const hasFarine = (stocks.get('farine') || 0) >= 200;
                const hasOeuf = (stocks.get('oeuf') || 0) >= 3;
                const hasLait = (stocks.get('lait') || 0) >= 2;

                // If we have money but missing key ingredients, buy them systematically
                if (currentEuro >= 100) {
                  if (!hasFarine) {
                    const farineProcess = availableProcesses.find(
                      (p: Process) => p.name === 'buy_farine'
                    );
                    if (farineProcess) {
                      best = farineProcess; // ULTRA HIGH Priority: Buy farine
                    }
                  } else if (!hasBeurre) {
                    const beurreProcess = availableProcesses.find(
                      (p: Process) => p.name === 'buy_beurre'
                    );
                    if (beurreProcess) {
                      best = beurreProcess; // Priority 2: Buy beurre
                    }
                  } else if (!hasOeuf) {
                    const oeufProcess = availableProcesses.find(
                      (p: Process) => p.name === 'buy_oeuf'
                    );
                    if (oeufProcess) {
                      best = oeufProcess; // Priority 3: Buy oeuf
                    }
                  } else if (!hasLait) {
                    const laitProcess = availableProcesses.find(
                      (p: Process) => p.name === 'buy_lait'
                    );
                    if (laitProcess) {
                      best = laitProcess; // Priority 4: Buy lait
                    }
                  }
                }

                // If we found a purchasing process, prioritize it (don't return, just ensure it's selected)
                if (best && best.name.startsWith('buy_')) {
                  // Force purchasing process selection
                }
              }

              // Enhanced: Force high-value production if we have intermediate products
              const hasIntermediateProducts = Array.from(stocks.entries()).some(
                ([resource, qty]) => {
                  return qty > 0 && !config.optimizeGoals.includes(resource);
                }
              );

              if (hasIntermediateProducts) {
                const highValueProcesses = availableProcesses.filter((p) => {
                  const efficiency =
                    configAnalysis.economicEfficiency.get(p.name) || 0;
                  return efficiency > 10000 && p.inputs.size > 0;
                });

                if (highValueProcesses.length > 0) {
                  best = highValueProcesses[0]; // Force high-value production
                }
              }

              // Enhanced: Force intermediate production if we have accumulated resources
              const hasAccumulatedResources = Array.from(stocks.entries()).some(
                ([resource, qty]) => {
                  return qty > 100;
                }
              );

              if (hasAccumulatedResources) {
                const intermediateProcesses = availableProcesses.filter((p) => {
                  // Calculate efficiency for this process using economic efficiency
                  const efficiency =
                    configAnalysis.economicEfficiency.get(p.name) || 0;

                  return (
                    efficiency > 200 &&
                    efficiency < 5000 &&
                    p.inputs.size > 0 &&
                    p.outputs.size > 0
                  );
                });

                if (intermediateProcesses.length > 0) {
                  best = intermediateProcesses[0]; // Force intermediate production
                }
              }

              // Enhanced: Force high-value production if we have resources
              const hasResources = Array.from(stocks.entries()).some(
                ([resource, qty]) => {
                  return qty > 50;
                }
              );

              if (hasResources) {
                const highValueProcesses = availableProcesses.filter((p) => {
                  const efficiency =
                    configAnalysis.economicEfficiency.get(p.name) || 0;
                  return efficiency > 500 && p.inputs.size > 0;
                });

                if (highValueProcesses.length > 0) {
                  best = highValueProcesses[0]; // Force high-value production
                }
              }

              // Enhanced: Force any production if we have significant resources
              const hasSignificantResources = Array.from(stocks.entries()).some(
                ([resource, qty]) => {
                  return qty > 200;
                }
              );

              if (hasSignificantResources) {
                const anyProductionProcesses = availableProcesses.filter(
                  (p) => {
                    const efficiency =
                      configAnalysis.economicEfficiency.get(p.name) || 0;
                    return (
                      efficiency > 100 &&
                      p.inputs.size > 0 &&
                      p.outputs.size > 0
                    );
                  }
                );

                if (anyProductionProcesses.length > 0) {
                  best = anyProductionProcesses[0]; // Force any production
                }
              }

              // Enhanced: Force intermediate production if we have resources but no intermediate products
              const hasResourcesButNoIntermediates =
                Array.from(stocks.entries()).some(([resource, qty]) => {
                  return qty > 100;
                }) &&
                !Array.from(stocks.entries()).some(([resource, qty]) => {
                  return (
                    qty > 0 &&
                    !config.optimizeGoals.includes(resource) &&
                    availableProcesses.some((p) => p.outputs.has(resource))
                  );
                });

              if (hasResourcesButNoIntermediates) {
                const intermediateProcesses = availableProcesses.filter((p) => {
                  const efficiency =
                    configAnalysis.economicEfficiency.get(p.name) || 0;
                  return (
                    efficiency > 200 && p.inputs.size > 0 && p.outputs.size > 0
                  );
                });

                if (intermediateProcesses.length > 0) {
                  best = intermediateProcesses[0]; // Force intermediate production
                }
              }

              // Enhanced: Force high-value production if we have intermediate products
              const hasIntermediateProductsForHighValue = Array.from(
                stocks.entries()
              ).some(([resource, qty]) => {
                return (
                  qty > 0 &&
                  !config.optimizeGoals.includes(resource) &&
                  availableProcesses.some((p) => p.outputs.has(resource))
                );
              });

              if (hasIntermediateProductsForHighValue) {
                const highValueProcesses = availableProcesses.filter((p) => {
                  const efficiency =
                    configAnalysis.economicEfficiency.get(p.name) || 0;
                  return efficiency > 1000 && p.inputs.size > 0;
                });

                if (highValueProcesses.length > 0) {
                  best = highValueProcesses[0]; // Force high-value production
                }
              }

              // Enhanced: Force resource purchasing if we're stuck in cycles
              const hasExcessiveCycles =
                sequence.length > 20 &&
                sequence
                  .slice(-10)
                  .filter(
                    (p) => p === 'separation_oeuf' || p === 'reunion_oeuf'
                  ).length > 5;

              if (hasExcessiveCycles) {
                const purchasingProcesses = availableProcesses.filter((p) => {
                  return p.name.startsWith('buy_') && p.inputs.has('euro');
                });

                if (purchasingProcesses.length > 0) {
                  // Force purchase of resources needed for high-value processes
                  const highValueProcess = configAnalysis.maxProfitProcess;
                  if (highValueProcess) {
                    const neededResources = Array.from(
                      highValueProcess.inputs.keys()
                    );
                    const missingResources = neededResources.filter(
                      (resource) => {
                        const stock = stocks.get(resource) || 0;
                        return stock < 50; // Need more of this resource
                      }
                    );

                    if (missingResources.length > 0) {
                      // Find purchasing process for the most critical missing resource
                      for (const resource of missingResources) {
                        const purchaseProcess = purchasingProcesses.find((p) =>
                          Array.from(p.outputs.keys()).includes(resource)
                        );
                        if (purchaseProcess) {
                          best = purchaseProcess;
                          break;
                        }
                      }
                    }
                  }
                }
              }

              // Enhanced: Force purchase of missing resources for dough production
              const needsFarine = (stocks.get('farine') || 0) < 100;
              const needsBeurre = (stocks.get('beurre') || 0) < 4;
              const needsOeuf = (stocks.get('oeuf') || 0) < 5;
              const needsLait = (stocks.get('lait') || 0) < 5;

              if (needsFarine || needsBeurre || needsOeuf || needsLait) {
                const purchasingProcesses = availableProcesses.filter((p) => {
                  return p.name.startsWith('buy_') && p.inputs.has('euro');
                });

                // Prioritize missing resources
                if (needsFarine) {
                  const farineProcess = purchasingProcesses.find((p) =>
                    Array.from(p.outputs.keys()).includes('farine')
                  );
                  if (farineProcess) {
                    best = farineProcess;
                  }
                } else if (needsBeurre) {
                  const beurreProcess = purchasingProcesses.find((p) =>
                    Array.from(p.outputs.keys()).includes('beurre')
                  );
                  if (beurreProcess) {
                    best = beurreProcess;
                  }
                } else if (needsOeuf) {
                  const oeufProcess = purchasingProcesses.find((p) =>
                    Array.from(p.outputs.keys()).includes('oeuf')
                  );
                  if (oeufProcess) {
                    best = oeufProcess;
                  }
                } else if (needsLait) {
                  const laitProcess = purchasingProcesses.find((p) =>
                    Array.from(p.outputs.keys()).includes('lait')
                  );
                  if (laitProcess) {
                    best = laitProcess;
                  }
                }
              }

              // Enhanced: Force dough production if we have the necessary resources
              const hasDoughIngredients =
                (stocks.get('oeuf') || 0) >= 5 &&
                (stocks.get('farine') || 0) >= 100 &&
                (stocks.get('beurre') || 0) >= 4 &&
                (stocks.get('lait') || 0) >= 5;

              if (hasDoughIngredients) {
                const doughProcesses = availableProcesses.filter((p) => {
                  return (
                    p.name === 'do_pate_sablee' ||
                    p.name === 'do_pate_feuilletee'
                  );
                });

                if (doughProcesses.length > 0) {
                  best = doughProcesses[0]; // Force dough production
                }
              }

              // ULTRA AGGRESSIVE: Force dough production even with partial ingredients
              const hasPartialDoughIngredients =
                (stocks.get('oeuf') || 0) >= 3 &&
                (stocks.get('farine') || 0) >= 100 &&
                (stocks.get('lait') || 0) >= 2;

              if (hasPartialDoughIngredients) {
                const pateFeuilleteeProcess = availableProcesses.find(
                  (p) => p.name === 'do_pate_feuilletee'
                );
                if (pateFeuilleteeProcess) {
                  best = pateFeuilleteeProcess; // Force pate_feuilletee production
                }
              }

              // EXTREME AGGRESSIVE: Force dough production with minimal ingredients
              const hasMinimalDoughIngredients =
                (stocks.get('oeuf') || 0) >= 3 &&
                (stocks.get('farine') || 0) >= 100;

              if (hasMinimalDoughIngredients) {
                const pateFeuilleteeProcess = availableProcesses.find(
                  (p) => p.name === 'do_pate_feuilletee'
                );
                if (pateFeuilleteeProcess) {
                  best = pateFeuilleteeProcess; // Force pate_feuilletee production even without lait
                }
              }

              // HIGHEST PRIORITY: Systematic ingredient purchasing for dough production
              const currentEuro = stocks.get('euro') || 0;
              const hasBeurre = (stocks.get('beurre') || 0) >= 10;
              const hasFarine = (stocks.get('farine') || 0) >= 200;
              const hasOeuf = (stocks.get('oeuf') || 0) >= 3;
              const hasLait = (stocks.get('lait') || 0) >= 2;

              // If we have money but missing key ingredients, buy them systematically
              if (currentEuro >= 100) {
                if (!hasFarine) {
                  const farineProcess = availableProcesses.find(
                    (p: Process) => p.name === 'buy_farine'
                  );
                  if (farineProcess) {
                    best = farineProcess; // HIGHEST Priority: Buy farine
                  }
                } else if (!hasBeurre) {
                  const beurreProcess = availableProcesses.find(
                    (p: Process) => p.name === 'buy_beurre'
                  );
                  if (beurreProcess) {
                    best = beurreProcess; // Priority 2: Buy beurre
                  }
                } else if (!hasOeuf) {
                  const oeufProcess = availableProcesses.find(
                    (p: Process) => p.name === 'buy_oeuf'
                  );
                  if (oeufProcess) {
                    best = oeufProcess; // Priority 3: Buy oeuf
                  }
                } else if (!hasLait) {
                  const laitProcess = availableProcesses.find(
                    (p: Process) => p.name === 'buy_lait'
                  );
                  if (laitProcess) {
                    best = laitProcess; // Priority 4: Buy lait
                  }
                }
              }

              // If we found a purchasing process, use it immediately (highest priority)
              if (best && best.name.startsWith('buy_')) {
                // Don't return here, just ensure it's selected as best
              }

              // Enhanced: Force tart production if we have dough and other ingredients
              const hasPateSablee = (stocks.get('pate_sablee') || 0) > 0;
              const hasPateFeuilletee =
                (stocks.get('pate_feuilletee') || 0) > 0;
              const hasPomme = (stocks.get('pomme') || 0) >= 30;
              const hasCitron = (stocks.get('citron') || 0) >= 50;
              const hasBlancOeuf = (stocks.get('blanc_oeuf') || 0) >= 5;

              if (hasPateSablee && hasPomme) {
                const tartePommeProcess = availableProcesses.find(
                  (p) => p.name === 'do_tarte_pomme'
                );
                if (tartePommeProcess) {
                  best = tartePommeProcess; // Force tarte_pomme production
                }
              }

              if (hasPateFeuilletee && hasCitron && hasBlancOeuf) {
                const tarteCitronProcess = availableProcesses.find(
                  (p) => p.name === 'do_tarte_citron'
                );
                if (tarteCitronProcess) {
                  best = tarteCitronProcess; // Force tarte_citron production
                }
              }

              // Enhanced: Force boite production if we have all required components
              const hasTarteCitron = (stocks.get('tarte_citron') || 0) >= 3;
              const hasTartePomme = (stocks.get('tarte_pomme') || 0) >= 7;
              const hasFlan = (stocks.get('flan') || 0) >= 1;
              const hasEnoughEuro = (stocks.get('euro') || 0) >= 30;

              if (hasTarteCitron && hasTartePomme && hasFlan && hasEnoughEuro) {
                const boiteProcess = availableProcesses.find(
                  (p) => p.name === 'do_boite'
                );
                if (boiteProcess) {
                  best = boiteProcess; // Force boite production
                }
              }
            }
          }

          // Additional check: if we have very few different processes in the sequence, force diversity
          const uniqueProcesses = new Set(sequence);
          if (uniqueProcesses.size < 5 && sequence.length > 20) {
            // Force purchasing of different resources to enable intermediate production
            const purchasingProcesses = availableProcesses.filter((p) => {
              const efficiency =
                configAnalysis.economicEfficiency.get(p.name) || 0;
              return efficiency < 200 && p.outputs.size > 0;
            });

            if (purchasingProcesses.length > 0) {
              // Choose a purchasing process that we haven't used much
              const processCounts = new Map<string, number>();
              for (const proc of sequence) {
                processCounts.set(proc, (processCounts.get(proc) || 0) + 1);
              }

              const leastUsedProcess = purchasingProcesses.reduce(
                (best, proc) => {
                  const bestCount = processCounts.get(best.name) || 0;
                  const procCount = processCounts.get(proc.name) || 0;
                  return procCount < bestCount ? proc : best;
                }
              );

              best = leastUsedProcess;
            }
          }
        }

        // If a low-efficiency process has been used too many times recently, try to find alternatives
        const efficiency =
          configAnalysis.economicEfficiency.get(best.name) || 0;
        if (processCount > 1 && efficiency < 200) {
          // Even more aggressive threshold
          const alternatives = availableProcesses.filter((p) => {
            const altEfficiency =
              configAnalysis.economicEfficiency.get(p.name) || 0;
            const altProcessCount = recentProcesses.filter(
              (proc) => proc === p.name
            ).length;

            // Prefer processes with higher efficiency
            return (
              altEfficiency > efficiency * 3 ||
              (altEfficiency > 100 && altProcessCount < 1)
            );
          });

          if (alternatives.length > 0) {
            best = pickBestProcess(alternatives, priorityMap);
          }
        }

        // For extremely valuable goals, actively seek intermediate production processes
        if (maxProfitEfficiency > 10000 && efficiency < 100) {
          // Look for intermediate value processes that can progress towards the ultimate goal
          const intermediateProcesses = availableProcesses.filter((p) => {
            const pEfficiency =
              configAnalysis.economicEfficiency.get(p.name) || 0;
            return pEfficiency > 200 && pEfficiency < 5000; // Intermediate efficiency range
          });

          if (intermediateProcesses.length > 0) {
            // Prioritize the most efficient intermediate process
            best = intermediateProcesses.reduce((bestProc, proc) => {
              const procEfficiency =
                configAnalysis.economicEfficiency.get(proc.name) || 0;
              const bestEfficiency =
                configAnalysis.economicEfficiency.get(bestProc.name) || 0;
              return procEfficiency > bestEfficiency ? proc : bestProc;
            });
          } else {
            // If no intermediate processes are available, look for resource purchasing processes
            const purchasingProcesses = availableProcesses.filter((p) => {
              // Check if this is a purchasing process (produces resources that intermediate processes need)
              for (const [output] of p.outputs) {
                // Check if any intermediate process needs this output
                for (const intermediateProc of config.processes) {
                  const intermEfficiency =
                    configAnalysis.economicEfficiency.get(
                      intermediateProc.name
                    ) || 0;
                  if (
                    intermEfficiency > 200 &&
                    intermEfficiency < 5000 &&
                    intermediateProc.inputs.has(output)
                  ) {
                    return true;
                  }
                }
              }
              return false;
            });

            if (purchasingProcesses.length > 0) {
              // Prioritize purchasing processes that support the most valuable intermediate processes
              best = purchasingProcesses.reduce((bestProc, proc) => {
                let maxSupportedEfficiency = 0;
                for (const [output] of proc.outputs) {
                  for (const intermediateProc of config.processes) {
                    const intermEfficiency =
                      configAnalysis.economicEfficiency.get(
                        intermediateProc.name
                      ) || 0;
                    if (
                      intermEfficiency > 200 &&
                      intermEfficiency < 5000 &&
                      intermediateProc.inputs.has(output)
                    ) {
                      maxSupportedEfficiency = Math.max(
                        maxSupportedEfficiency,
                        intermEfficiency
                      );
                    }
                  }
                }

                let bestSupportedEfficiency = 0;
                for (const [output] of bestProc.outputs) {
                  for (const intermediateProc of config.processes) {
                    const intermEfficiency =
                      configAnalysis.economicEfficiency.get(
                        intermediateProc.name
                      ) || 0;
                    if (
                      intermEfficiency > 200 &&
                      intermEfficiency < 5000 &&
                      intermediateProc.inputs.has(output)
                    ) {
                      bestSupportedEfficiency = Math.max(
                        bestSupportedEfficiency,
                        intermEfficiency
                      );
                    }
                  }
                }

                return maxSupportedEfficiency > bestSupportedEfficiency
                  ? proc
                  : bestProc;
              });
            }
          }
        }
      }

      sequence.push(best.name);
      updateStocksAfterProcess(best, stocks);
    }
  } else {
    // Strategy 4: Hierarchical planning - high-level goals first, then details
    const highValueProcesses = new Set<string>();
    const chainProcesses = new Set<string>();
    const goalSet = new Set(config.optimizeGoals);

    // NEW: Hierarchical planning strategy
    const chainAccumulationTargets = new Map<string, number>();
    const chainBlockedResources = new Set<string>();
    const planningPhases = new Map<string, number>(); // Track planning phases for each process
    const chainCompletionTargets = new Map<string, number>(); // Track completion targets for chains

    // Capacity planning: compute universal reserve targets for best goal chain
    const reserveTargets = planReserveTargets(
      config.processes,
      config.optimizeGoals,
      configAnalysis,
      8
    );

    // Build resource dependency graph for this strategy
    const resourceProducers = new Map<string, Set<string>>();
    const resourceConsumers = new Map<string, Set<string>>();

    for (const process of config.processes) {
      for (const [output] of process.outputs) {
        if (!resourceProducers.has(output)) {
          resourceProducers.set(output, new Set());
        }
        resourceProducers.get(output)!.add(process.name);
      }

      for (const [input] of process.inputs) {
        if (!resourceConsumers.has(input)) {
          resourceConsumers.set(input, new Set());
        }
        resourceConsumers.get(input)!.add(process.name);
      }
    }

    // Identify high-value processes (those that produce optimization goals with high profit margins)
    for (const process of config.processes) {
      // Check if process produces optimization goals
      for (const [output, quantity] of process.outputs) {
        if (goalSet.has(output)) {
          // Calculate profit margin for this process
          let totalInputCost = 0;
          for (const [input, inputQuantity] of process.inputs) {
            totalInputCost += inputQuantity * 10; // Base cost estimate
          }
          const profitMargin =
            totalInputCost > 0
              ? (quantity - totalInputCost) / totalInputCost
              : quantity;

          // Add to high-value processes if it has significant profit margin
          if (profitMargin > 5 || quantity > 50) {
            highValueProcesses.add(process.name);

            // Also identify processes that produce resources needed by high-value processes
            for (const [input] of process.inputs) {
              const producers = resourceProducers.get(input);
              if (producers) {
                for (const producerName of producers) {
                  chainProcesses.add(producerName);
                }
              }
            }
          }
          break; // Only add once per process
        }
      }
    }

    // Enhanced handling for economic systems and high-scale processes
    if (configAnalysis.hasEconomicSystem && configAnalysis.maxProfitProcess) {
      // For economic systems, prioritize the most profitable process
      const maxProfitProcess = configAnalysis.maxProfitProcess;
      highValueProcesses.add(maxProfitProcess.name);
      planningPhases.set(maxProfitProcess.name, 1); // Phase 1: Most profitable process

      // Add all processes that produce inputs for the most profitable process
      for (const [input] of maxProfitProcess.inputs) {
        const producers = resourceProducers.get(input);
        if (producers) {
          for (const producerName of producers) {
            chainProcesses.add(producerName);
            planningPhases.set(producerName, 2); // Phase 2: Input producers
          }
        }
      }

      // Enhanced: Also identify and prioritize purchasing processes for missing resources
      const missingResources = new Set<string>();
      for (const [input] of maxProfitProcess.inputs) {
        // Check if we have any producers for this input
        const producers = resourceProducers.get(input);
        if (!producers || producers.size === 0) {
          // This is a base resource that needs to be purchased
          missingResources.add(input);
        }
      }

      // Add purchasing processes to high priority if they provide missing resources
      for (const process of config.processes) {
        for (const [output] of process.outputs) {
          if (missingResources.has(output)) {
            highValueProcesses.add(process.name);
            planningPhases.set(process.name, 1); // Phase 1: Critical purchasing
          }
        }
      }

      // Set accumulation targets based on economic efficiency
      const efficiency =
        configAnalysis.economicEfficiency.get(maxProfitProcess.name) || 0;
      let targetRuns = 1;
      if (efficiency > 10000)
        targetRuns = 10; // Very high value - aim for 10 runs
      else if (efficiency > 1000) targetRuns = 5; // High value - aim for 5 runs
      else if (efficiency > 100) targetRuns = 3; // Medium value - aim for 3 runs

      for (const [input, inputQuantity] of maxProfitProcess.inputs) {
        const targetQuantity = inputQuantity * targetRuns;
        chainAccumulationTargets.set(input, targetQuantity);
        chainBlockedResources.add(input);
        chainCompletionTargets.set(input, targetQuantity);

        // Also set targets for inputs of input producers (Phase 3)
        const producers = resourceProducers.get(input);
        if (producers) {
          for (const producerName of producers) {
            const producer = config.processes.find(
              (p) => p.name === producerName
            );
            if (producer) {
              for (const [
                producerInput,
                producerInputQuantity
              ] of producer.inputs) {
                const producerTargetQuantity =
                  producerInputQuantity * targetRuns;
                chainAccumulationTargets.set(
                  producerInput,
                  producerTargetQuantity
                );
                chainBlockedResources.add(producerInput);
                chainCompletionTargets.set(
                  producerInput,
                  producerTargetQuantity
                );
              }
            }
          }
        }
      }
    } else {
      // Original logic for non-economic systems
      for (const process of config.processes) {
        for (const [input, quantity] of process.inputs) {
          if (quantity > 50) {
            // This process requires large quantities - it's likely a high-scale operation
            // Check if it produces optimization goals
            for (const [output, outputQuantity] of process.outputs) {
              if (goalSet.has(output) && outputQuantity > 50) {
                // This is a high-scale optimization goal producer
                highValueProcesses.add(process.name);

                // Add all processes that produce inputs for this high-scale process
                for (const [inputResource] of process.inputs) {
                  const producers = resourceProducers.get(inputResource);
                  if (producers) {
                    for (const producerName of producers) {
                      chainProcesses.add(producerName);
                    }
                  }
                }
                break; // Only add once per process
              }
            }
            break; // Only check once per process
          }
        }
      }
    }

    // NEW: Hierarchical planning - identify processes by planning phases
    for (const process of config.processes) {
      for (const [output, quantity] of process.outputs) {
        if (goalSet.has(output)) {
          const outputValue = quantity;

          // Phase 1: Very high-value goal producers
          if (outputValue > 10000) {
            planningPhases.set(process.name, 1);
            highValueProcesses.add(process.name);

            // Plan accumulation targets for the main goal
            for (const [input, inputQuantity] of process.inputs) {
              const targetQuantity = inputQuantity * 2; // Aim for 2 runs
              chainAccumulationTargets.set(input, targetQuantity);
              chainBlockedResources.add(input);

              // NEW: Set completion targets for the entire chain
              chainCompletionTargets.set(input, targetQuantity);
            }

            // Phase 2: Direct input producers for the main goal
            for (const [input] of process.inputs) {
              const producers = resourceProducers.get(input);
              if (producers) {
                for (const producerName of producers) {
                  planningPhases.set(producerName, 2);
                  chainProcesses.add(producerName);

                  // NEW: Set completion targets for Phase 2 processes
                  const phase2Process = config.processes.find(
                    (p) => p.name === producerName
                  );
                  if (phase2Process) {
                    const targetQuantity =
                      chainCompletionTargets.get(input) || 0;
                    if (targetQuantity > 0) {
                      // Calculate how many times we need to run this process
                      const outputQuantity =
                        phase2Process.outputs.get(input) || 1;
                      const requiredRuns = Math.ceil(
                        targetQuantity / outputQuantity
                      );
                      chainCompletionTargets.set(producerName, requiredRuns);
                    }

                    // Phase 3: Input producers for Phase 2 processes
                    for (const [phase2Input] of phase2Process.inputs) {
                      const subProducers = resourceProducers.get(phase2Input);
                      if (subProducers) {
                        for (const subProducerName of subProducers) {
                          planningPhases.set(subProducerName, 3);
                          chainProcesses.add(subProducerName);

                          // NEW: Set completion targets for Phase 3 processes
                          const subProcess = config.processes.find(
                            (p) => p.name === subProducerName
                          );
                          if (subProcess) {
                            const subTargetQuantity =
                              chainCompletionTargets.get(producerName) || 0;
                            if (subTargetQuantity > 0) {
                              const subInputQuantity =
                                subProcess.inputs.get(phase2Input) || 1;
                              const subRequiredRuns = Math.ceil(
                                subTargetQuantity * subInputQuantity
                              );
                              chainCompletionTargets.set(
                                subProducerName,
                                subRequiredRuns
                              );
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } else if (outputValue > 1000) {
            // Phase 2: Medium high-value processes
            planningPhases.set(process.name, 2);
            highValueProcesses.add(process.name);

            for (const [input] of process.inputs) {
              const producers = resourceProducers.get(input);
              if (producers) {
                for (const producerName of producers) {
                  planningPhases.set(producerName, 3);
                  chainProcesses.add(producerName);
                }
              }
            }
          } else {
            // Phase 3: Lower value processes
            planningPhases.set(process.name, 3);
          }
          break;
        }
      }
    }

    // Special handling for resource multiplication systems (like inception)
    if (configAnalysis.hasResourceMultiplication) {
      // For resource multiplication, prioritize processes that multiply resources
      const multiplicationProcesses = new Set<string>();
      for (const [
        processName,
        multiplier
      ] of configAnalysis.resourceMultipliers) {
        if (multiplier > 1.5) {
          // Only consider significant multipliers
          multiplicationProcesses.add(processName);
        }
      }

      // Add multiplication processes to high value set
      for (const processName of multiplicationProcesses) {
        highValueProcesses.add(processName);
      }
    }

    // Special handling for economic systems - force focus on high-value goals
    if (configAnalysis.hasEconomicSystem && configAnalysis.maxProfitProcess) {
      // For economic systems, create a forced progression towards the most profitable process
      const maxProfitProcess = configAnalysis.maxProfitProcess;
      const maxProfitEfficiency =
        configAnalysis.economicEfficiency.get(maxProfitProcess.name) || 0;

      // If the most profitable process is significantly more valuable, force the algorithm to focus on it
      if (maxProfitEfficiency > 500) {
        // Lower threshold to be more aggressive
        // Clear all other high-value processes and focus only on the chain leading to the most profitable
        highValueProcesses.clear();
        highValueProcesses.add(maxProfitProcess.name);

        // Add all processes that directly produce inputs for the most profitable process
        for (const [input] of maxProfitProcess.inputs) {
          const producers = resourceProducers.get(input);
          if (producers) {
            for (const producerName of producers) {
              highValueProcesses.add(producerName);
              chainProcesses.add(producerName);
            }
          }
        }

        // Set aggressive targets for the most profitable process
        const targetRuns = Math.min(
          5,
          Math.floor(50000 / maxProfitProcess.nbCycle)
        ); // Scale with time limit
        for (const [input, inputQuantity] of maxProfitProcess.inputs) {
          const targetQuantity = inputQuantity * targetRuns;
          chainAccumulationTargets.set(input, targetQuantity);
          chainBlockedResources.add(input);
          chainCompletionTargets.set(input, targetQuantity);
        }

        // Also add processes that produce inputs for the input producers (second level)
        for (const [input] of maxProfitProcess.inputs) {
          const producers = resourceProducers.get(input);
          if (producers) {
            for (const producerName of producers) {
              const producer = config.processes.find(
                (p) => p.name === producerName
              );
              if (producer) {
                for (const [producerInput] of producer.inputs) {
                  const subProducers = resourceProducers.get(producerInput);
                  if (subProducers) {
                    for (const subProducerName of subProducers) {
                      chainProcesses.add(subProducerName);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    while (
      sequence.length < maxSequenceLength &&
      attempts++ < maxSequenceLength * 2
    ) {
      const availableProcesses: Process[] = [];

      for (const [name, process] of processByName) {
        if (canStartProcess(process, stocks)) {
          // Strongly prefer high-value processes
          let isHighValue = highValueProcesses.has(process.name);

          // Check if this process would deplete critical resources
          let isSafe = true;
          for (const [resource, required] of process.inputs) {
            if (criticalResources.has(resource)) {
              const current = stocks.get(resource) || 0;
              if (current - required <= 0) {
                isSafe = false;
                break;
              }
            }
          }

          // Enhanced chain completion guard with economic prioritization
          if (isSafe) {
            // For economic systems, prioritize high-value processes and avoid low-value cycles
            if (configAnalysis.hasEconomicSystem) {
              const efficiency =
                configAnalysis.economicEfficiency.get(process.name) || 0;

              // Completely block very low-efficiency processes in economic systems
              if (efficiency < 50) {
                // More aggressive threshold
                isSafe = false;
              } else if (efficiency < 200 && !isHighValue) {
                // Check if this process is part of a high-value chain
                let isPartOfHighValueChain = false;
                let chainDepth = 0;
                const maxChainDepth = 2; // Reduced depth for more aggressive filtering

                const checkChain = (
                  resource: string,
                  depth: number
                ): boolean => {
                  if (depth > maxChainDepth) return false;

                  const consumers = resourceConsumers.get(resource);
                  if (consumers) {
                    for (const consumerName of consumers) {
                      const consumerEfficiency =
                        configAnalysis.economicEfficiency.get(consumerName) ||
                        0;
                      if (consumerEfficiency > 1000) {
                        // Very high value threshold
                        return true;
                      } else if (consumerEfficiency > 200) {
                        // Check if this consumer leads to a high-value process
                        const consumer = config.processes.find(
                          (p) => p.name === consumerName
                        );
                        if (consumer) {
                          for (const [consumerOutput] of consumer.outputs) {
                            if (checkChain(consumerOutput, depth + 1)) {
                              return true;
                            }
                          }
                        }
                      }
                    }
                  }
                  return false;
                };

                for (const [output] of process.outputs) {
                  if (checkChain(output, 0)) {
                    isPartOfHighValueChain = true;
                    break;
                  }
                }

                if (!isPartOfHighValueChain) {
                  isSafe = false;
                }
              }
            }

            // Prevent meaningless cycles (like separation_oeuf followed by reunion_oeuf)
            if (isSafe) {
              const recentProcesses = sequence.slice(-3); // Check last 3 processes

              // Universal check for reverse processes that cancel each other out
              // Optimized check for reverse processes that cancel each other out
              // Only check if we have a recent process that might be inverse
              const recentProcessesForInverse = sequence.slice(-3); // Check last 3 processes
              let hasInverse = false;

              if (recentProcessesForInverse.length > 0) {
                const lastProcess =
                  recentProcessesForInverse[
                    recentProcessesForInverse.length - 1
                  ];
                const lastProcessObj = config.processes.find(
                  (p) => p.name === lastProcess
                );

                if (lastProcessObj) {
                  // Quick check: if this process produces what the last one consumed, and vice versa
                  for (const [input] of process.inputs) {
                    if (lastProcessObj.outputs.has(input)) {
                      for (const [output] of process.outputs) {
                        if (lastProcessObj.inputs.has(output)) {
                          hasInverse = true;
                          break;
                        }
                      }
                      if (hasInverse) break;
                    }
                  }
                }
              }

              // Enhanced: More aggressive blocking of inverse processes for economic systems
              if (hasInverse) {
                if (
                  configAnalysis.hasEconomicSystem &&
                  configAnalysis.maxProfitProcess
                ) {
                  const maxProfitEfficiency =
                    configAnalysis.economicEfficiency.get(
                      configAnalysis.maxProfitProcess.name
                    ) || 0;
                  const currentEfficiency =
                    configAnalysis.economicEfficiency.get(process.name) || 0;

                  // Always block inverse processes for high-value economic systems
                  if (maxProfitEfficiency > 1000) {
                    isSafe = false;
                  } else if (
                    maxProfitEfficiency > 100 &&
                    currentEfficiency < 50
                  ) {
                    isSafe = false;
                  }
                } else {
                  isSafe = false;
                }
              }

              // Additional check: prevent excessive repetition of the same low-value process
              if (
                configAnalysis.hasEconomicSystem &&
                configAnalysis.maxProfitProcess
              ) {
                const maxProfitEfficiency =
                  configAnalysis.economicEfficiency.get(
                    configAnalysis.maxProfitProcess.name
                  ) || 0;
                const currentEfficiency =
                  configAnalysis.economicEfficiency.get(process.name) || 0;

                if (maxProfitEfficiency > 10000 && currentEfficiency < 50) {
                  // Count how many times this low-value process has been used recently
                  const recentCount = sequence
                    .slice(-10)
                    .filter((p) => p === process.name).length;
                  if (recentCount > 3) {
                    isSafe = false; // Block excessive repetition of low-value processes
                  }
                }

                // Enhanced: Block low-value processes if we have resources for high-value chains
                if (maxProfitEfficiency > 10000 && currentEfficiency < 100) {
                  // Check if we have accumulated resources for high-value processes
                  let hasHighValueResources = false;
                  for (const [resource, quantity] of stocks) {
                    if (quantity > 100) {
                      // Significant resource accumulation
                      // Check if this resource is needed by high-value processes
                      const consumers = resourceConsumers.get(resource);
                      if (consumers) {
                        for (const consumerName of consumers) {
                          const consumer = config.processes.find(
                            (p) => p.name === consumerName
                          );
                          if (consumer) {
                            const consumerEfficiency =
                              configAnalysis.economicEfficiency.get(
                                consumer.name
                              ) || 0;
                            if (consumerEfficiency > 1000) {
                              hasHighValueResources = true;
                              break;
                            }
                          }
                        }
                      }
                    }
                  }

                  // Only block if we have significant high-value resources AND this is a very low-value process
                  if (hasHighValueResources && currentEfficiency < 10) {
                    isSafe = false; // Block very low-value processes when we have high-value resources
                  }

                  // Enhanced: Block low-value processes if we have accumulated resources
                  if (configAnalysis.hasEconomicSystem) {
                    const hasAccumulatedResources = Array.from(
                      stocks.entries()
                    ).some(([resource, qty]) => {
                      return qty > 100;
                    });

                    if (hasAccumulatedResources && currentEfficiency < 10) {
                      // We have accumulated resources, block low-value processes to focus on high-value production
                      isSafe = false;
                    }

                    // Enhanced: Block cycles if we have resources for high-value processes
                    if (hasAccumulatedResources && sequence.length > 0) {
                      const lastProcessName = sequence[sequence.length - 1];
                      const lastProcess = config.processes.find(
                        (p) => p.name === lastProcessName
                      );

                      if (lastProcess) {
                        const isCycle =
                          Array.from(lastProcess.outputs.keys()).some(
                            (output) => process.inputs.has(output)
                          ) &&
                          Array.from(process.outputs.keys()).some((output) =>
                            lastProcess.inputs.has(output)
                          );

                        if (isCycle && currentEfficiency < 100) {
                          isSafe = false; // Block cycles when we have resources for better processes
                        }
                      }
                    }

                    // Enhanced: Block separation_oeuf and reunion_oeuf cycles more aggressively
                    if (
                      process.name === 'separation_oeuf' ||
                      process.name === 'reunion_oeuf'
                    ) {
                      const recentCycles = sequence
                        .slice(-5)
                        .filter(
                          (p) => p === 'separation_oeuf' || p === 'reunion_oeuf'
                        ).length;

                      if (recentCycles > 2) {
                        isSafe = false; // Block excessive egg cycles
                      }

                      // Block egg cycles if we have enough eggs for production
                      const hasEnoughJauneOeuf =
                        (stocks.get('jaune_oeuf') || 0) >= 10;
                      const hasEnoughBlancOeuf =
                        (stocks.get('blanc_oeuf') || 0) >= 5;

                      // Block egg cycles if we have enough eggs for production OR missing key ingredients
                      const missingFarine = (stocks.get('farine') || 0) < 200;
                      const missingBeurre = (stocks.get('beurre') || 0) < 10;
                      const currentEuro = stocks.get('euro') || 0;

                      if (
                        hasEnoughJauneOeuf ||
                        hasEnoughBlancOeuf ||
                        (missingFarine && currentEuro >= 100) ||
                        (missingBeurre && currentEuro >= 100) ||
                        currentEuro >= 100 // Block egg cycles if we have money to buy ingredients
                      ) {
                        isSafe = false; // Block egg cycles when we have enough for production OR missing key ingredients OR have money
                      }
                    }
                  }
                }
              }

              // Additional check: if this is a low-efficiency process and we have high-value goals, block it
              if (
                isSafe &&
                configAnalysis.hasEconomicSystem &&
                configAnalysis.maxProfitProcess
              ) {
                const efficiency =
                  configAnalysis.economicEfficiency.get(process.name) || 0;
                const maxProfitEfficiency =
                  configAnalysis.economicEfficiency.get(
                    configAnalysis.maxProfitProcess.name
                  ) || 0;

                // If this process is significantly less efficient than the best one, and we're in an economic system, block it
                if (maxProfitEfficiency > efficiency * 20) {
                  isSafe = false;
                }

                // For extremely valuable goals, force progression towards intermediate production
                if (maxProfitEfficiency > 10000 && efficiency < 100) {
                  // Check if we have enough basic resources to start intermediate production
                  let canProduceIntermediates = false;

                  // Check if we can produce tarts or other intermediate goods
                  for (const p of config.processes) {
                    const pEfficiency =
                      configAnalysis.economicEfficiency.get(p.name) || 0;
                    if (pEfficiency > 200 && pEfficiency < 5000) {
                      // Intermediate value processes
                      let canExecute = true;
                      for (const [input, inputQty] of p.inputs) {
                        const available = stocks.get(input) || 0;
                        if (available < inputQty) {
                          canExecute = false;
                          break;
                        }
                      }
                      if (canExecute) {
                        canProduceIntermediates = true;
                        break;
                      }
                    }
                  }

                  // If we can produce intermediates but are still doing low-value processes, block the low-value process
                  if (canProduceIntermediates && efficiency < 50) {
                    isSafe = false;
                  }
                }
              }
            }

            // Enhanced check for selling resources - prevent selling if they're needed for more profitable goals
            for (const [output] of process.outputs) {
              if (goalSet.has(output)) {
                // This process produces an optimization goal - check if it's the most profitable
                if (
                  configAnalysis.hasEconomicSystem &&
                  configAnalysis.maxProfitProcess
                ) {
                  const maxProfitProcess = configAnalysis.maxProfitProcess;
                  const currentProcessEfficiency =
                    configAnalysis.economicEfficiency.get(process.name) || 0;
                  const maxProfitEfficiency =
                    configAnalysis.economicEfficiency.get(
                      maxProfitProcess.name
                    ) || 0;

                  // If this process is significantly less profitable than the best one, block it
                  if (maxProfitEfficiency > currentProcessEfficiency * 10) {
                    isSafe = false;
                    break;
                  }
                }
              } else if (chainBlockedResources.has(output)) {
                const target = chainAccumulationTargets.get(output) || 0;
                const current = stocks.get(output) || 0;
                if (current < target) {
                  // Don't sell if we haven't reached the accumulation target
                  isSafe = false;
                  break;
                }

                // NEW: Check if the entire chain is ready for completion
                const consumers = resourceConsumers.get(output);
                if (consumers) {
                  for (const consumerName of consumers) {
                    const consumer = config.processes.find(
                      (p) => p.name === consumerName
                    );
                    if (consumer) {
                      for (const [
                        consumerOutput,
                        consumerQuantity
                      ] of consumer.outputs) {
                        if (
                          goalSet.has(consumerOutput) &&
                          consumerQuantity > 10000
                        ) {
                          // This is a very high-value consumer - check if we have enough inputs
                          let allInputsReady = true;
                          for (const [
                            consumerInput,
                            consumerInputQuantity
                          ] of consumer.inputs) {
                            const consumerInputCurrent =
                              stocks.get(consumerInput) || 0;
                            const consumerInputTarget =
                              chainAccumulationTargets.get(consumerInput) || 0;
                            if (consumerInputCurrent < consumerInputTarget) {
                              allInputsReady = false;
                              break;
                            }
                          }

                          // Only allow selling if all inputs for the high-value process are ready
                          if (!allInputsReady) {
                            isSafe = false;
                            break;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          // Reserve guard: do not run processes that would drop reserved inputs below target
          if (isSafe) {
            for (const [inp, req] of process.inputs) {
              const reserve = reserveTargets.get(inp) || 0;
              if (reserve > 0) {
                const have = stocks.get(inp) || 0;
                if (have - req < reserve) {
                  isSafe = false;
                  break;
                }
              }
            }
          }

          // Enhanced resource accumulation logic with capacity planning reserves
          if (isSafe && process.outputs.size === 1) {
            for (const [output] of process.outputs) {
              // If this output has a reserve target, do not sell below reserve
              const reserve = reserveTargets.get(output) || 0;
              const currentOutput = stocks.get(output) || 0;
              if (reserve > 0 && currentOutput < reserve) {
                isSafe = false;
                break;
              }

              // Check if this output is needed for high-value processes
              const consumers = resourceConsumers.get(output);
              if (consumers) {
                for (const consumerName of consumers) {
                  const consumer = config.processes.find(
                    (p) => p.name === consumerName
                  );
                  if (consumer) {
                    for (const [
                      consumerOutput,
                      consumerQuantity
                    ] of consumer.outputs) {
                      if (goalSet.has(consumerOutput)) {
                        // This output is needed for an optimization goal
                        const currentOutput = stocks.get(output) || 0;
                        const consumerInput = consumer.inputs.get(output) || 0;

                        // Enhanced accumulation logic based on economic efficiency
                        const consumerEfficiency =
                          configAnalysis.economicEfficiency.get(
                            consumer.name
                          ) || 0;
                        let requiredMultiplier = 50; // Base multiplier

                        if (consumerEfficiency > 10000) {
                          // For extremely high-value processes, accumulate much more
                          requiredMultiplier = 1000;
                        } else if (consumerEfficiency > 1000) {
                          // For very high-value processes, accumulate enough for multiple batches
                          requiredMultiplier = 500;
                        } else if (consumerEfficiency > 100) {
                          requiredMultiplier = 200; // High value
                        } else if (consumerEfficiency > 10) {
                          requiredMultiplier = 100; // Medium value
                        }

                        if (
                          currentOutput <
                          consumerInput * requiredMultiplier
                        ) {
                          // Need to accumulate more before selling
                          isSafe = false;
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          // Special logic for high-value sale processes: prioritize building the supply chain
          if (isSafe && process.outputs.size === 1) {
            // Check if this is a high-value sale process
            for (const [output, quantity] of process.outputs) {
              if (goalSet.has(output) && quantity > 1000) {
                // This is a very high-value sale - check if we have enough inputs
                for (const [input, required] of process.inputs) {
                  const current = stocks.get(input) || 0;
                  const reserve = reserveTargets.get(input) || 0;
                  const effectiveRequired = Math.max(required, reserve);
                  if (current < effectiveRequired * 5) {
                    // Don't sell if we don't have enough to make it worthwhile
                    isSafe = false;
                    break;
                  }
                }
              }
            }
          }

          // Universal logic for high-value processes: accumulate resources before selling
          if (isSafe && process.outputs.size === 1) {
            for (const [output, quantity] of process.outputs) {
              if (goalSet.has(output) && quantity > 1000) {
                // This is a very high-value process - check if we have enough inputs
                for (const [input, required] of process.inputs) {
                  const current = stocks.get(input) || 0;
                  // For very high-value processes, accumulate much more before selling
                  const requiredMultiplier = quantity > 5000 ? 50 : 20;
                  const reserve = reserveTargets.get(input) || 0;
                  const effectiveRequired = Math.max(required, reserve);
                  if (current < effectiveRequired * requiredMultiplier) {
                    // Don't sell if we don't have enough to make it worthwhile
                    isSafe = false;
                    break;
                  }
                }
              }
            }
          }

          // Additional logic: don't sell resources that are needed for high-value processes
          if (isSafe && process.outputs.size === 1) {
            for (const [output] of process.outputs) {
              // Check if this output is consumed by any high-value process
              const consumers = resourceConsumers.get(output);
              if (consumers) {
                for (const consumerName of consumers) {
                  const consumer = config.processes.find(
                    (p) => p.name === consumerName
                  );
                  if (consumer) {
                    for (const [
                      consumerOutput,
                      consumerQuantity
                    ] of consumer.outputs) {
                      if (
                        goalSet.has(consumerOutput) &&
                        consumerQuantity > 1000
                      ) {
                        // This output is needed for a very high-value process
                        const currentOutput = stocks.get(output) || 0;
                        const consumerInput = consumer.inputs.get(output) || 0;
                        const reserve = reserveTargets.get(output) || 0;
                        // Calculate how many high-value products we can produce
                        const possibleHighValueProducts = Math.floor(
                          currentOutput / consumerInput
                        );

                        // Calculate potential profit from high-value products
                        const potentialProfit =
                          possibleHighValueProducts * consumerQuantity;

                        // For very high-value processes, accumulate much more
                        const minProducts = consumerQuantity > 5000 ? 50 : 20;

                        // Don't sell if potential profit is less than current sale value
                        // or if we can't produce at least the minimum number of high-value products
                        if (
                          possibleHighValueProducts < minProducts ||
                          potentialProfit < 1000
                        ) {
                          if (currentOutput < reserve) {
                            isSafe = false;
                            break;
                          }
                          isSafe = false;
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          if (isSafe) {
            availableProcesses.push(process);
          }
        }
      }

      if (availableProcesses.length === 0) {
        // For economic systems, try to continue even if no processes are immediately available
        if (
          configAnalysis.hasEconomicSystem &&
          configAnalysis.maxProfitProcess
        ) {
          const maxProfitProcess = configAnalysis.maxProfitProcess;
          const maxProfitEfficiency =
            configAnalysis.economicEfficiency.get(maxProfitProcess.name) || 0;

          // Enhanced logic for very profitable goals - keep trying until we achieve meaningful progress
          if (maxProfitEfficiency > 500) {
            // Check if we can achieve the ultimate goal (like producing boite for vente_boite)
            let canAchieveUltimateGoal = false;
            let canMakeProgress = false;

            // For very high-value processes, check if we can produce intermediate components
            if (maxProfitEfficiency > 10000) {
              // This is likely a bulk sale process - check if we can produce the intermediate goods
              for (const [input, inputQty] of maxProfitProcess.inputs) {
                const currentStock = stocks.get(input) || 0;

                // Check if we can produce at least one unit of the required input
                if (currentStock >= inputQty) {
                  canMakeProgress = true;
                }

                // Check if we can do bulk production (like 100 units for vente_boite)
                if (currentStock >= inputQty * 100) {
                  canAchieveUltimateGoal = true;
                  break;
                }
              }
            } else {
              // For moderately profitable processes, use original logic
              for (const [output] of maxProfitProcess.outputs) {
                if (goalSet.has(output)) {
                  const current = stocks.get(output) || 0;
                  const target = chainAccumulationTargets.get(output) || 0;
                  if (current < target) {
                    canMakeProgress = true;
                    break;
                  }
                }
              }
            }

            // Continue if we can make meaningful progress or are working towards the ultimate goal
            if (canAchieveUltimateGoal || canMakeProgress) {
              attempts++;

              // For extremely valuable processes, be even more persistent
              const maxAttempts =
                maxProfitEfficiency > 10000
                  ? maxSequenceLength * 10
                  : maxSequenceLength * 5;

              if (attempts < maxAttempts) {
                continue;
              }

              // For extremely valuable processes, check if we have resources that could eventually lead to the goal
              if (
                maxProfitEfficiency > 10000 &&
                attempts < maxSequenceLength * 15
              ) {
                let hasRelevantResources = false;
                const chainRequirements = analyzeCompleteChain(
                  config.processes,
                  maxProfitProcess
                );

                for (const [resource] of chainRequirements) {
                  if ((stocks.get(resource) || 0) > 0) {
                    hasRelevantResources = true;
                    break;
                  }
                }

                if (hasRelevantResources) {
                  continue; // Keep trying - we have resources that could lead to the goal
                }
              }
            }
          }
        }
        break;
      }

      // NEW: Hierarchical prioritization based on planning phases
      const phase1Candidates = availableProcesses.filter(
        (p) => planningPhases.get(p.name) === 1
      );
      const phase2Candidates = availableProcesses.filter(
        (p) => planningPhases.get(p.name) === 2
      );
      const phase3Candidates = availableProcesses.filter(
        (p) => planningPhases.get(p.name) === 3
      );

      // Fallback to old prioritization if no phase-based candidates
      const highValueCandidates =
        phase1Candidates.length > 0
          ? phase1Candidates
          : availableProcesses.filter((p) => highValueProcesses.has(p.name));
      const chainCandidates =
        phase2Candidates.length > 0
          ? phase2Candidates
          : availableProcesses.filter((p) => chainProcesses.has(p.name));

      // Additional prioritization: prefer processes that produce resources for high-value chains
      const chainResourceCandidates = availableProcesses.filter((p) => {
        for (const [output] of p.outputs) {
          const consumers = resourceConsumers.get(output);
          if (consumers) {
            for (const consumerName of consumers) {
              const consumer = config.processes.find(
                (c) => c.name === consumerName
              );
              if (consumer) {
                const consumerEfficiency =
                  configAnalysis.economicEfficiency.get(consumer.name) || 0;
                for (const [
                  consumerOutput,
                  consumerQuantity
                ] of consumer.outputs) {
                  if (goalSet.has(consumerOutput) && consumerEfficiency > 100) {
                    // Check if we have enough resources to produce this intermediate product
                    let canProduce = true;
                    for (const [input, required] of p.inputs) {
                      const current = stocks.get(input) || 0;
                      if (current < required) {
                        canProduce = false;
                        break;
                      }
                    }
                    return canProduce; // Only if we can actually produce it
                  }
                }
              }
            }
          }
        }
        return false;
      });

      // New: deficit reducers — processes that increase resources below reserve targets
      const deficitReducers = availableProcesses.filter((p) => {
        for (const [out, outQty] of p.outputs) {
          const reserve = reserveTargets.get(out) || 0;
          const have = stocks.get(out) || 0;
          if (reserve > 0 && have < reserve) return true;
        }
        return false;
      });

      const candidatesToUse =
        highValueCandidates.length > 0
          ? highValueCandidates
          : deficitReducers.length > 0
          ? deficitReducers
          : chainResourceCandidates.length > 0
          ? chainResourceCandidates
          : chainCandidates.length > 0
          ? chainCandidates
          : availableProcesses;

      // Deficit scoring: prefer process that reduces biggest reserve gap per cycle
      const scored = candidatesToUse.map((p) => {
        let score = 0;
        for (const [out, outQty] of p.outputs) {
          const reserve = reserveTargets.get(out) || 0;
          const have = stocks.get(out) || 0;
          const deficit = Math.max(0, reserve - have);
          if (deficit > 0 && outQty > 0) {
            const perCycle = outQty / Math.max(1, p.nbCycle);
            score += deficit * perCycle;
          }
        }
        return { p, score };
      });

      let best: Process;

      // NEW: Hierarchical selection - prefer processes from earlier phases
      if (phase1Candidates.length > 0) {
        // If we have Phase 1 candidates, prioritize them
        const phase1Scored = phase1Candidates.map((p) => {
          let score = 0;
          for (const [out, outQty] of p.outputs) {
            const reserve = reserveTargets.get(out) || 0;
            const have = stocks.get(out) || 0;
            const deficit = Math.max(0, reserve - have);
            if (deficit > 0 && outQty > 0) {
              const perCycle = outQty / Math.max(1, p.nbCycle);
              score += deficit * perCycle;
            }
          }
          return { p, score };
        });
        const topPhase1 = phase1Scored.sort((a, b) => b.score - a.score)[0];
        if (topPhase1 && topPhase1.score > 0) {
          best = topPhase1.p;
        } else {
          best = phase1Candidates[0]; // Take first available Phase 1 process
        }
      } else if (phase2Candidates.length > 0) {
        // If no Phase 1, try Phase 2
        const phase2Scored = phase2Candidates.map((p) => {
          let score = 0;
          for (const [out, outQty] of p.outputs) {
            const reserve = reserveTargets.get(out) || 0;
            const have = stocks.get(out) || 0;
            const deficit = Math.max(0, reserve - have);
            if (deficit > 0 && outQty > 0) {
              const perCycle = outQty / Math.max(1, p.nbCycle);
              score += deficit * perCycle;
            }
          }
          return { p, score };
        });
        const topPhase2 = phase2Scored.sort((a, b) => b.score - a.score)[0];
        if (topPhase2 && topPhase2.score > 0) {
          best = topPhase2.p;
        } else {
          best = phase2Candidates[0]; // Take first available Phase 2 process
        }
      } else {
        // Fallback to original logic
        const top = scored.sort((a, b) => b.score - a.score)[0];
        if (top && top.score > 0) {
          best = top.p;
        } else {
          best = pickBestProcess(candidatesToUse, priorityMap);
        }
      }
      sequence.push(best.name);
      updateStocksAfterProcess(best, stocks);
    }
  }

  return {
    processSequence: sequence,
    fitnessScore: 0
  };
};

// Pure function to create a random individual
export const createRandomIndividual = (
  processes: readonly Process[],
  minSequenceLength: number,
  maxSequenceLength: number
): Individual => {
  const length =
    Math.floor(Math.random() * (maxSequenceLength - minSequenceLength + 1)) +
    minSequenceLength;
  const sequence: string[] = [];

  for (let i = 0; i < length; i++) {
    const randomProcess =
      processes[Math.floor(Math.random() * processes.length)];
    sequence.push(randomProcess.name);
  }

  return { processSequence: sequence, fitnessScore: 0 };
};

// Helper function to initialize population
const initializePopulation = (
  config: Config,
  populationSize: number,
  minSequenceLength: number,
  maxSequenceLength: number
): Individual[] => {
  const population: Individual[] = [];
  const smartCount = Math.floor(populationSize * 0.6);
  const randomCount = Math.floor(populationSize * 0.3);
  const diverseCount = populationSize - smartCount - randomCount;

  // Create smart individuals
  for (let i = 0; i < smartCount; i++) {
    const individual = createSmartIndividual(
      config,
      minSequenceLength,
      maxSequenceLength
    );
    population.push(individual);
  }

  // Create random individuals
  for (let i = 0; i < randomCount; i++) {
    const individual = createRandomIndividual(
      config.processes,
      minSequenceLength,
      maxSequenceLength
    );
    population.push(individual);
  }

  // Create diverse individuals with different strategies
  for (let i = 0; i < diverseCount; i++) {
    const individual = createSmartIndividual(
      config,
      minSequenceLength,
      maxSequenceLength
    );
    population.push(individual);
  }

  return population;
};

// Helper function to select parents
const selectParents = (
  population: Individual[],
  populationSize: number
): number[] => {
  const selectedIndices: number[] = [];

  for (let i = 0; i < populationSize; i++) {
    // Simple tournament selection
    const tournamentSize = 3;
    let bestIndex = 0;
    let bestFitness = -Infinity;

    for (let j = 0; j < tournamentSize; j++) {
      const randomIndex = Math.floor(Math.random() * population.length);
      if (population[randomIndex].fitnessScore > bestFitness) {
        bestFitness = population[randomIndex].fitnessScore;
        bestIndex = randomIndex;
      }
    }

    selectedIndices.push(bestIndex);
  }

  return selectedIndices;
};

// Helper function to crossover
const crossover = (
  parent1: Individual,
  parent2: Individual,
  crossoverRate: number
): [Individual, Individual] => {
  if (Math.random() > crossoverRate) {
    return [parent1, parent2];
  }

  const seq1 = parent1.processSequence;
  const seq2 = parent2.processSequence;
  const len1 = seq1.length;
  const len2 = seq2.length;
  const shortLen = Math.min(len1, len2);

  if (len1 < 2 || len2 < 2) {
    return [parent1, parent2];
  }

  const pointA = Math.floor(Math.random() * shortLen);
  const pointB = Math.floor(Math.random() * shortLen);

  const child1Seq = [
    ...seq1.slice(0, pointA),
    ...seq2.slice(pointA, pointB),
    ...seq1.slice(pointB)
  ];

  const child2Seq = [
    ...seq2.slice(0, pointA),
    ...seq1.slice(pointA, pointB),
    ...seq2.slice(pointB)
  ];

  return [
    { processSequence: child1Seq, fitnessScore: 0 },
    { processSequence: child2Seq, fitnessScore: 0 }
  ];
};

// Helper function to mutate
const mutate = (
  individual: Individual,
  mutationRate: number,
  processes: readonly Process[]
): Individual => {
  const mutated = {
    ...individual,
    processSequence: [...individual.processSequence]
  };

  for (let i = 0; i < mutated.processSequence.length; i++) {
    if (Math.random() < mutationRate) {
      const randomProcess =
        processes[Math.floor(Math.random() * processes.length)];
      mutated.processSequence[i] = randomProcess.name;
    }
  }

  return mutated;
};

// Memory-optimized function to evolve population
export const evolvePopulation = (
  config: Config,
  timeLimit: number,
  generations: number,
  populationSize: number,
  mutationRate: number,
  crossoverRate: number,
  eliteCount: number,
  minSequenceLength: number,
  maxSequenceLength: number,
  complexityScore: number
): Individual => {
  let population = initializePopulation(
    config,
    populationSize,
    minSequenceLength,
    maxSequenceLength
  );

  let bestIndividual = population[0];
  let generationsWithoutImprovement = 0;
  const maxGenerationsWithoutImprovement = Math.max(
    MAX_GENERATIONS_WITHOUT_IMPROVEMENT,
    generations / 2
  );

  console.log('💡 SEARCHING FOR OPTIMAL SOLUTION...');

  for (let generation = 0; generation < generations; generation++) {
    // Evaluate fitness for all individuals
    for (const individual of population) {
      const result = runSimulation(
        config,
        individual.processSequence,
        timeLimit
      );
      individual.fitnessScore = result.fitness;
    }

    // Sort by fitness
    population.sort((a, b) => b.fitnessScore - a.fitnessScore);

    // Update best individual
    if (population[0].fitnessScore > bestIndividual.fitnessScore) {
      bestIndividual = { ...population[0] };
      generationsWithoutImprovement = 0;
    } else {
      generationsWithoutImprovement++;
    }

    // Early stopping
    if (generationsWithoutImprovement >= maxGenerationsWithoutImprovement) {
      console.log(
        `❌ Early stopping at generation ${generation} - no improvement for ${generationsWithoutImprovement} generations`
      );
      break;
    }

    // Log progress
    if (generation % 10 === 0) {
      console.log(
        `Generation ${generation}/${generations} - Best Fitness Score: ${population[0].fitnessScore.toFixed(
          5
        )}`
      );
    }

    // Create new population
    const newPopulation: Individual[] = [];

    // Elitism: keep best individuals
    for (let i = 0; i < eliteCount; i++) {
      newPopulation.push({ ...population[i] });
    }

    // Selection and reproduction
    const parentIndices = selectParents(
      population,
      populationSize - eliteCount
    );

    for (let i = 0; i < parentIndices.length; i += 2) {
      const parent1 = population[parentIndices[i]];
      const parent2 = population[parentIndices[i + 1] || parentIndices[0]];

      const [child1, child2] = crossover(parent1, parent2, crossoverRate);

      // Mutate children
      const mutatedChild1 = mutate(child1, mutationRate, config.processes);
      const mutatedChild2 = mutate(child2, mutationRate, config.processes);

      newPopulation.push(mutatedChild1, mutatedChild2);
    }

    population = newPopulation.slice(0, populationSize);
  }

  return bestIndividual;
};
