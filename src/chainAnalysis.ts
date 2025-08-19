import { Config, Process } from './types';

export interface ChainAnalysis {
  resourcePaths: Map<string, ResourcePathAnalysis>;
  processStrategies: Map<string, ProcessStrategy>;
  goalStrategies: Map<string, GoalStrategy>;
  scaleRequirements: Map<string, ScaleRequirement>;
}

export interface ResourcePathAnalysis {
  resource: string;
  directPaths: number;
  chainPaths: number;
  totalValue: number;
  requiredScale: number;
  consumers: string[];
  producers: string[];
  maxChainDepth: number;
}

export interface ProcessStrategy {
  process: string;
  directValue: number;
  chainValue: number;
  requiredInputs: Map<string, number>;
  productionSteps: number;
  timeToComplete: number;
  complexity: number;
  scaleMultiplier: number;
}

export interface GoalStrategy {
  goal: string;
  strategies: ProcessStrategy[];
  bestStrategy: ProcessStrategy;
  totalValue: number;
  totalTime: number;
  totalComplexity: number;
}

export interface ScaleRequirement {
  resource: string;
  targetQuantity: number;
  currentQuantity: number;
  deficit: number;
  requiredProcesses: Map<string, number>;
  timeToProduce: number;
}

export function analyzeResourceChains(config: Config): ChainAnalysis {
  const goalSet = new Set(config.optimizeGoals);

  // Build dependency graphs
  const resourceProducers = new Map<string, Set<string>>();
  const resourceConsumers = new Map<string, Set<string>>();
  const processByName = new Map<string, Process>();

  for (const process of config.processes) {
    processByName.set(process.name, process);

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

  // Analyze resource paths
  const resourcePaths = new Map<string, ResourcePathAnalysis>();

  for (const resource of getAllResources(config)) {
    const analysis = analyzeResourcePath(
      resource,
      goalSet,
      resourceProducers,
      resourceConsumers,
      processByName
    );
    resourcePaths.set(resource, analysis);
  }

  // Analyze process strategies
  const processStrategies = new Map<string, ProcessStrategy>();

  for (const process of config.processes) {
    const strategy = analyzeProcessStrategy(
      process,
      goalSet,
      resourceProducers,
      resourceConsumers,
      processByName
    );
    processStrategies.set(process.name, strategy);
  }

  // Analyze goal strategies
  const goalStrategies = new Map<string, GoalStrategy>();

  for (const goal of config.optimizeGoals) {
    const strategy = analyzeGoalStrategy(
      goal,
      goalSet,
      resourceProducers,
      resourceConsumers,
      processByName,
      processStrategies
    );
    goalStrategies.set(goal, strategy);
  }

  // Calculate scale requirements
  const scaleRequirements = calculateScaleRequirements(
    config,
    goalStrategies,
    resourceProducers,
    processByName
  );

  return {
    resourcePaths,
    processStrategies,
    goalStrategies,
    scaleRequirements
  };
}

function getAllResources(config: Config): Set<string> {
  const resources = new Set<string>();

  // Add initial stocks
  for (const stock of config.stocks) {
    resources.add(stock.name);
  }

  // Add all inputs and outputs
  for (const process of config.processes) {
    for (const [resource] of process.inputs) {
      resources.add(resource);
    }
    for (const [resource] of process.outputs) {
      resources.add(resource);
    }
  }

  return resources;
}

function analyzeResourcePath(
  resource: string,
  goalSet: Set<string>,
  resourceProducers: Map<string, Set<string>>,
  resourceConsumers: Map<string, Set<string>>,
  processByName: Map<string, Process>
): ResourcePathAnalysis {
  const consumers = Array.from(resourceConsumers.get(resource) || []);
  const producers = Array.from(resourceProducers.get(resource) || []);

  let directPaths = 0;
  let chainPaths = 0;
  let totalValue = 0;
  let requiredScale = 0;
  let maxChainDepth = 0;

  // Check if this resource is directly consumed by goal producers
  for (const consumerName of consumers) {
    const consumer = processByName.get(consumerName);
    if (consumer) {
      for (const [output, quantity] of consumer.outputs) {
        if (goalSet.has(output)) {
          directPaths++;
          totalValue += quantity * 100; // Base value for optimization goals
          requiredScale = Math.max(
            requiredScale,
            consumer.inputs.get(resource) || 0
          );
        }
      }
    }
  }

  // Analyze chain paths (recursive)
  const chainAnalysis = analyzeChainPaths(
    resource,
    goalSet,
    resourceProducers,
    resourceConsumers,
    processByName,
    new Set(),
    0
  );
  chainPaths = chainAnalysis.paths;
  totalValue += chainAnalysis.value;
  maxChainDepth = chainAnalysis.maxDepth;

  return {
    resource,
    directPaths,
    chainPaths,
    totalValue,
    requiredScale,
    consumers,
    producers,
    maxChainDepth
  };
}

function analyzeChainPaths(
  resource: string,
  goalSet: Set<string>,
  resourceProducers: Map<string, Set<string>>,
  resourceConsumers: Map<string, Set<string>>,
  processByName: Map<string, Process>,
  visited: Set<string>,
  depth: number
): { paths: number; value: number; maxDepth: number } {
  if (visited.has(resource) || depth > 5) {
    // Reduced from 10 to 5
    return { paths: 0, value: 0, maxDepth: depth };
  }

  visited.add(resource);
  let totalPaths = 0;
  let totalValue = 0;
  let maxDepth = depth;

  const consumers = resourceConsumers.get(resource);
  if (consumers) {
    for (const consumerName of consumers) {
      const consumer = processByName.get(consumerName);
      if (consumer) {
        for (const [output, quantity] of consumer.outputs) {
          if (goalSet.has(output)) {
            totalPaths++;
            totalValue += quantity * 100;
          } else {
            // Recursive analysis
            const subAnalysis = analyzeChainPaths(
              output,
              goalSet,
              resourceProducers,
              resourceConsumers,
              processByName,
              new Set(visited),
              depth + 1
            );
            totalPaths += subAnalysis.paths;
            totalValue += subAnalysis.value;
            maxDepth = Math.max(maxDepth, subAnalysis.maxDepth);
          }
        }
      }
    }
  }

  return { paths: totalPaths, value: totalValue, maxDepth };
}

function analyzeProcessStrategy(
  process: Process,
  goalSet: Set<string>,
  resourceProducers: Map<string, Set<string>>,
  resourceConsumers: Map<string, Set<string>>,
  processByName: Map<string, Process>
): ProcessStrategy {
  let directValue = 0;
  let chainValue = 0;
  const requiredInputs = new Map<string, number>();
  let productionSteps = 0;
  let timeToComplete = process.nbCycle;
  let complexity = process.inputs.size;
  let scaleMultiplier = 1;

  // Calculate direct value
  for (const [output, quantity] of process.outputs) {
    if (goalSet.has(output)) {
      directValue += quantity * 100;
    }
  }

  // Calculate chain value
  for (const [output] of process.outputs) {
    const consumers = resourceConsumers.get(output);
    if (consumers) {
      for (const consumerName of consumers) {
        const consumer = processByName.get(consumerName);
        if (consumer) {
          for (const [consumerOutput, consumerQuantity] of consumer.outputs) {
            if (goalSet.has(consumerOutput)) {
              chainValue += consumerQuantity * 100;
              // Calculate scale multiplier based on consumer requirements
              const inputRequired = consumer.inputs.get(output) || 0;
              if (inputRequired > 0) {
                scaleMultiplier = Math.max(scaleMultiplier, inputRequired);
              }
            }
          }
        }
      }
    }
  }

  // Calculate required inputs and production steps
  for (const [input, quantity] of process.inputs) {
    requiredInputs.set(input, quantity);

    // Calculate production steps for this input
    const producers = resourceProducers.get(input);
    if (producers) {
      for (const producerName of producers) {
        const producer = processByName.get(producerName);
        if (producer) {
          productionSteps = Math.max(
            productionSteps,
            calculateProductionSteps(producer, resourceProducers, processByName)
          );
        }
      }
    }
  }

  return {
    process: process.name,
    directValue,
    chainValue,
    requiredInputs,
    productionSteps,
    timeToComplete,
    complexity,
    scaleMultiplier
  };
}

function calculateProductionSteps(
  process: Process,
  resourceProducers: Map<string, Set<string>>,
  processByName: Map<string, Process>,
  visited: Set<string> = new Set()
): number {
  if (visited.has(process.name) || visited.size > 20) {
    // Added size limit
    return 0; // Avoid cycles and limit depth
  }

  visited.add(process.name);
  let maxSteps = 0;

  for (const [input] of process.inputs) {
    const producers = resourceProducers.get(input);
    if (producers) {
      for (const producerName of producers) {
        const producer = processByName.get(producerName);
        if (producer) {
          maxSteps = Math.max(
            maxSteps,
            1 +
              calculateProductionSteps(
                producer,
                resourceProducers,
                processByName,
                new Set(visited)
              )
          );
        }
      }
    }
  }

  return maxSteps;
}

function analyzeGoalStrategy(
  goal: string,
  goalSet: Set<string>,
  resourceProducers: Map<string, Set<string>>,
  resourceConsumers: Map<string, Set<string>>,
  processByName: Map<string, Process>,
  processStrategies: Map<string, ProcessStrategy>
): GoalStrategy {
  const strategies: ProcessStrategy[] = [];

  // Find all processes that produce this goal
  const producers = resourceProducers.get(goal);
  if (producers) {
    for (const producerName of producers) {
      const strategy = processStrategies.get(producerName);
      if (strategy) {
        strategies.push(strategy);
      }
    }
  }

  // Sort strategies by total value (direct + chain)
  strategies.sort(
    (a, b) => b.directValue + b.chainValue - (a.directValue + a.chainValue)
  );

  const bestStrategy = strategies[0] || {
    process: '',
    directValue: 0,
    chainValue: 0,
    requiredInputs: new Map(),
    productionSteps: 0,
    timeToComplete: 0,
    complexity: 0,
    scaleMultiplier: 1
  };

  const totalValue = bestStrategy.directValue + bestStrategy.chainValue;
  const totalTime = bestStrategy.timeToComplete;
  const totalComplexity = bestStrategy.complexity;

  return {
    goal,
    strategies,
    bestStrategy,
    totalValue,
    totalTime,
    totalComplexity
  };
}

function calculateScaleRequirements(
  config: Config,
  goalStrategies: Map<string, GoalStrategy>,
  resourceProducers: Map<string, Set<string>>,
  processByName: Map<string, Process>
): Map<string, ScaleRequirement> {
  const scaleRequirements = new Map<string, ScaleRequirement>();

  for (const [goal, strategy] of goalStrategies) {
    const bestStrategy = strategy.bestStrategy;
    if (bestStrategy.process) {
      const process = processByName.get(bestStrategy.process);
      if (process) {
        // Calculate required quantities for high-scale processes
        for (const [input, quantity] of process.inputs) {
          const targetQuantity = quantity * bestStrategy.scaleMultiplier;
          const currentQuantity =
            config.stocks.find((s) => s.name === input)?.quantity || 0;
          const deficit = Math.max(0, targetQuantity - currentQuantity);

          if (deficit > 0) {
            const requiredProcesses = new Map<string, number>();
            let timeToProduce = 0;

            // Calculate how many processes needed to produce this deficit
            const producers = resourceProducers.get(input);
            if (producers) {
              for (const producerName of producers) {
                const producer = processByName.get(producerName);
                if (producer) {
                  const outputQuantity = producer.outputs.get(input) || 1;
                  const processesNeeded = Math.ceil(deficit / outputQuantity);
                  requiredProcesses.set(producerName, processesNeeded);
                  timeToProduce = Math.max(
                    timeToProduce,
                    producer.nbCycle * processesNeeded
                  );
                }
              }
            }

            scaleRequirements.set(input, {
              resource: input,
              targetQuantity,
              currentQuantity,
              deficit,
              requiredProcesses,
              timeToProduce
            });
          }
        }
      }
    }
  }

  return scaleRequirements;
}
