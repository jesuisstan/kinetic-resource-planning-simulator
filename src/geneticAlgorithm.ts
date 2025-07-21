import { Config, Process, Individual, StockState } from './types';
import {
  canStartProcess,
  updateStocksAfterProcess,
  runSimulation
} from './simulator';

const MAX_GENERATIONS_WITHOUT_IMPROVEMENT = 200;

// Simple and universal process priority calculation
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

  // Assign priorities based on distance to goals
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

  if (strategy < 0.3) {
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
  } else if (strategy < 0.6) {
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
  } else {
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

// Pure function to evolve population
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
        `Early stopping at generation ${generation} - no improvement for ${generationsWithoutImprovement} generations`
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
