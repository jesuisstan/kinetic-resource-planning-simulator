import { Config, Process, Individual, StockState } from './types';
import {
  canStartProcess,
  updateStocksAfterProcess,
  runSimulation
} from './simulator';

const MAX_GENERATIONS_WITHOUT_IMPROVEMENT = 300;

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

const planReserveTargets = (
  processes: readonly Process[],
  goals: readonly string[],
  maxDepth = 8
): ReserveTargets => {
  const reserves: ReserveTargets = new Map();
  const goalSet = new Set(goals);
  const resourceProducers = buildResourceProducers(processes);
  const topGoalProcess = pickTopGoalProcess(processes, goals);
  if (!topGoalProcess) return reserves;

  // Determine required input targets for the best goal producer
  // If this goal producer consumes a non-goal resource (like a box), we will propagate
  const enqueue: Array<{ resource: string; quantity: number; depth: number }> =
    [];

  // Calculate target runs for the best goal process
  // For high-value processes, aim for multiple runs to maximize profit
  let targetRuns = 1;
  for (const [output, qty] of topGoalProcess.outputs) {
    if (goalSet.has(output)) {
      // Calculate optimal target runs based on output value and process efficiency
      const outputValue = qty; // Direct optimization goal value
      const processEfficiency =
        outputValue / Math.max(1, topGoalProcess.nbCycle);

      // For very high-value processes, aim for multiple runs
      if (outputValue > 10000) {
        targetRuns = 2; // Aim for 2 runs of very high-value processes
      } else if (outputValue > 1000) {
        targetRuns = 1; // Single run for high-value processes
      } else if (outputValue > 100) {
        targetRuns = 2; // Aim for 2 runs of medium-value processes
      }
      break;
    }
  }

  for (const [input, qty] of topGoalProcess.inputs) {
    const totalQuantity = qty * targetRuns;
    enqueue.push({ resource: input, quantity: totalQuantity, depth: 0 });
    reserves.set(input, (reserves.get(input) || 0) + totalQuantity);
  }

  // Backward propagate required quantities through the graph using a greedy best-producer choice
  while (enqueue.length > 0) {
    const { resource, quantity, depth } = enqueue.shift()!;
    if (depth >= maxDepth) continue;
    const producers = resourceProducers.get(resource);
    if (!producers || producers.length === 0) continue; // base resource or cannot be produced
    const producer = chooseBestProducer(producers, resource);
    if (!producer) continue;

    const outQty = producer.outputs.get(resource) || 1;
    const runs = Math.ceil(quantity / outQty);

    // Add buffer for complex processes to ensure we have enough for the entire chain
    const bufferMultiplier = producer.inputs.size > 2 ? 1.5 : 1.0; // More buffer for complex processes
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
  // Skip deep chain analysis for performance - use basic logic instead
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

      const best = pickBestProcess(availableProcesses, priorityMap);
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

    // Special handling for high-scale processes (like vente_boite that requires 100 boite)
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

          // NEW: Chain completion guard - block selling until chains are complete
          if (isSafe) {
            // Check if this process would sell a resource that's part of an incomplete chain
            for (const [output] of process.outputs) {
              if (chainBlockedResources.has(output)) {
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

                        // Calculate required accumulation based on goal value and scale
                        let requiredMultiplier = 50; // Base multiplier - increased
                        if (consumerQuantity > 1000) {
                          // For very high-value processes, accumulate enough for multiple batches
                          requiredMultiplier = 500; // Very high value - accumulate much more
                        } else if (consumerQuantity > 100) {
                          requiredMultiplier = 200; // High value
                        } else if (consumerQuantity > 10) {
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

      if (availableProcesses.length === 0) break;

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
                for (const [
                  consumerOutput,
                  consumerQuantity
                ] of consumer.outputs) {
                  if (goalSet.has(consumerOutput) && consumerQuantity > 1000) {
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
