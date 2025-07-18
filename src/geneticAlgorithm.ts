import { Config, Process, Individual, StockState } from './types';
import {
  canStartProcess,
  updateStocksAfterProcess,
  runSimulation
} from './simulator';

// Helper function to calculate process chain score
const calculateProcessChainScore = (
  process: Process,
  processConsumers: Map<string, Set<string>>,
  optimizeGoals: readonly string[],
  processes: readonly Process[],
  initialStocks: ReadonlyMap<string, number>
): number => {
  let score = 0;

  // Build resource requirement map
  const resourceRequirements = new Map<string, Set<string>>();
  const resourceProducers = new Map<string, Set<string>>();
  const resourceConsumers = new Map<string, Set<string>>();
  const resourceDistances = new Map<string, number>();

  // First pass: direct requirements and producers
  for (const p of processes) {
    for (const [output] of p.outputs) {
      if (!resourceProducers.has(output)) {
        resourceProducers.set(output, new Set());
      }
      resourceProducers.get(output)!.add(p.name);

      if (!resourceRequirements.has(output)) {
        resourceRequirements.set(output, new Set());
      }
      for (const [input] of p.inputs) {
        resourceRequirements.get(output)!.add(input);
      }
    }
    for (const [input] of p.inputs) {
      if (!resourceConsumers.has(input)) {
        resourceConsumers.set(input, new Set());
      }
      resourceConsumers.get(input)!.add(p.name);
    }
  }

  // Calculate distances from goals using BFS
  const queue: [string, number][] = [];
  for (const goal of optimizeGoals) {
    queue.push([goal, 0]);
    resourceDistances.set(goal, 0);
  }

  while (queue.length > 0) {
    const [resource, distance] = queue.shift()!;
    const requirements = resourceRequirements.get(resource);
    if (requirements) {
      for (const req of requirements) {
        if (!resourceDistances.has(req)) {
          resourceDistances.set(req, distance + 1);
          queue.push([req, distance + 1]);
        }
      }
    }
  }

  // Calculate process type score
  let processTypeScore = 0;
  if (process.name.startsWith('buy_')) {
    // Check if this buying process produces required resources
    for (const [output, quantity] of process.outputs) {
      if (resourceDistances.has(output)) {
        const distance = resourceDistances.get(output)!;
        // Higher score for resources closer to goals
        processTypeScore += (20 / (distance + 1)) * Math.min(1, quantity / 100);
      }
      // Check if output is needed by other processes
      const consumers = resourceConsumers.get(output);
      if (consumers) {
        processTypeScore += consumers.size;
      }
    }
  } else if (process.name.startsWith('do_')) {
    // Production processes get base score
    processTypeScore = 400;
    // Extra score if producing a goal or near-goal resource
    for (const [output, quantity] of process.outputs) {
      const distance = resourceDistances.get(output);
      if (distance !== undefined) {
        processTypeScore += (40 / (distance + 1)) * Math.min(0.5, quantity);
      }
    }
    // Bonus for balanced input/output ratio
    const totalInputs = Array.from(process.inputs.values()).reduce(
      (a, b) => a + b,
      0
    );
    const totalOutputs = Array.from(process.outputs.values()).reduce(
      (a, b) => a + b,
      0
    );
    if (totalInputs > 0) {
      processTypeScore += Math.min(5, totalOutputs / totalInputs);
    }
  } else if (process.name.startsWith('vente_')) {
    // Sales processes get high score if they produce euro
    for (const [output, quantity] of process.outputs) {
      if (output === 'euro') {
        processTypeScore += Math.min(50, quantity / 100);
      }
    }
  }
  score += processTypeScore;

  // Calculate resource balance score
  let balanceScore = 0;
  for (const [input, required] of process.inputs) {
    const available = initialStocks.get(input) || 0;
    if (available > 0) {
      // Prefer processes that use available resources
      balanceScore += Math.min(5, available / required);
    }
    // Check if input is preserved
    const outputQty = process.outputs.get(input);
    if (outputQty !== undefined && outputQty >= required) {
      balanceScore += 2; // Bonus for preserving resources
    }
  }
  score += balanceScore;

  // Calculate dependency score
  let dependencyScore = 0;
  for (const [output, quantity] of process.outputs) {
    const consumers = resourceConsumers.get(output);
    if (consumers) {
      for (const consumer of consumers) {
        const consumerProcess = processes.find((p) => p.name === consumer);
        if (consumerProcess) {
          // Check if consumer produces goal or near-goal resources
          for (const [consumerOutput, consumerQty] of consumerProcess.outputs) {
            const distance = resourceDistances.get(consumerOutput);
            if (distance !== undefined) {
              // Score based on how much of our output the consumer needs
              const consumerNeed = consumerProcess.inputs.get(output) || 0;
              const ratio = Math.min(1, quantity / consumerNeed);
              dependencyScore += (5 / (distance + 1)) * ratio;
            }
          }
        }
      }
    }
  }
  score += dependencyScore;

  // Calculate resource scarcity score
  let scarcityScore = 0;
  for (const [output, quantity] of process.outputs) {
    const producers = resourceProducers.get(output)?.size || 0;
    if (producers <= 2) {
      scarcityScore += Math.min(5, quantity / producers);
    }
  }
  score += scarcityScore;

  // Time efficiency bonus (smaller for longer processes)
  score += Math.min(2, 5 / (process.nbCycle + 1));

  return score;
};

// Helper function to calculate availability penalty
const calculateAvailabilityPenalty = (
  process: Process,
  stocks: StockState
): number => {
  let penalty = 0;
  let maxInputRatio = 0;

  // Calculate the ratio of available to required for each input
  for (const [resource, required] of process.inputs) {
    const available = stocks.get(resource) || 0;
    const ratio = available / required;
    maxInputRatio = Math.max(maxInputRatio, ratio);

    // Higher penalty for consuming rare resources
    if (ratio < 2) {
      penalty += Math.pow(2 - ratio, 2) * 3;
    }
  }

  return penalty;
};

// Helper function to build process priority map (similar to C++ version)
const buildProcessPriority = (
  processes: readonly Process[],
  optimizeGoals: readonly string[]
): Map<string, number> => {
  const priorityMap = new Map<string, number>();
  const goalSet = new Set(optimizeGoals);

  // Processes that produce goals get priority 0
  for (const process of processes) {
    for (const [outputName] of process.outputs) {
      if (goalSet.has(outputName)) {
        priorityMap.set(process.name, 0);
        break;
      }
    }
  }

  // Processes that are inputs for priority 0 processes get priority 1
  // Processes that are inputs for priority 1 processes get priority 2
  for (let depth = 1; depth <= 2; ++depth) {
    for (const process of processes) {
      if (priorityMap.has(process.name)) continue;

      for (const [outputName] of process.outputs) {
        for (const otherProcess of processes) {
          if (
            priorityMap.has(otherProcess.name) &&
            priorityMap.get(otherProcess.name) === depth - 1 &&
            otherProcess.inputs.has(outputName)
          ) {
            priorityMap.set(process.name, depth);
            break;
          }
        }
        if (priorityMap.has(process.name)) break;
      }
    }
  }

  return priorityMap;
};

// Helper function to pick best process (similar to C++ version)
const pickBestProcess = (
  candidates: Process[],
  priorityMap: Map<string, number>
): Process => {
  return candidates.reduce((best, current) => {
    const bestPriority = priorityMap.get(best.name) ?? 3;
    const currentPriority = priorityMap.get(current.name) ?? 3;

    if (bestPriority !== currentPriority) {
      return bestPriority < currentPriority ? best : current;
    }

    return best.nbCycle < current.nbCycle ? best : current;
  });
};

// Pure function to create a smart individual
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

  while (
    sequence.length < maxSequenceLength &&
    attempts++ < maxSequenceLength * 2
  ) {
    const availableProcesses: Process[] = [];

    for (const [name, process] of processByName) {
      if (canStartProcess(process, stocks)) {
        availableProcesses.push(process);
      }
    }

    if (availableProcesses.length === 0) break;

    const best = pickBestProcess(availableProcesses, priorityMap);
    sequence.push(best.name);
    updateStocksAfterProcess(best, stocks);
  }

  // Fill up to minimum length if needed
  if (sequence.length < minSequenceLength && sequence.length > 0) {
    while (sequence.length < minSequenceLength) {
      const randomIndex = Math.floor(Math.random() * sequence.length);
      sequence.push(sequence[randomIndex]);
    }
  }

  return { processSequence: sequence, fitnessScore: 0 };
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
  const smartCount = Math.floor(populationSize * 0.8);
  const randomCount = populationSize - smartCount;

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

  return population;
};

// Helper function to select parents (simplified version)
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

// Helper function to crossover (simplified version)
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

// Helper function to mutate (simplified version)
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
  // Initialize population
  const population = initializePopulation(
    config,
    populationSize,
    minSequenceLength,
    maxSequenceLength
  );

  // Early stopping variables
  let generationsWithoutImprovement = 0;
  const maxGenerationsWithoutImprovement = 142; // Stop if no improvement for 142 generations
  let bestFitnessSoFar = -Infinity;
  let bestIndividualSoFar: Individual | null = null;
  const shouldUseEarlyStopping = complexityScore >= 100; // Only for high complexity scenarios

  // Evolution loop
  for (let generation = 0; generation < generations; generation++) {
    // Evaluate population
    for (const individual of population) {
      const result = runSimulation(
        config,
        individual.processSequence,
        timeLimit
      );
      individual.fitnessScore = result.fitness;
    }

    // Find best individual in current generation
    const currentBestIndividual = population.reduce((best, current) =>
      current.fitnessScore > best.fitnessScore ? current : best
    );

    // Check for improvement
    if (currentBestIndividual.fitnessScore > bestFitnessSoFar) {
      bestFitnessSoFar = currentBestIndividual.fitnessScore;
      bestIndividualSoFar = { ...currentBestIndividual };
      generationsWithoutImprovement = 0;
    } else {
      generationsWithoutImprovement++;
    }

    // Early stopping check
    if (
      shouldUseEarlyStopping &&
      generationsWithoutImprovement >= maxGenerationsWithoutImprovement
    ) {
      console.log(
        `Early stopping at generation ${generation} - no improvement for ${maxGenerationsWithoutImprovement} generations`
      );
      break;
    }

    // Progress logging
    if (generation % 10 === 0) {
      console.log(
        `Generation ${generation}/${generations} - Best Fitness Score: ${currentBestIndividual.fitnessScore.toFixed(
          5
        )}`
      );
    }

    // Selection
    const selectedIndices = selectParents(population, populationSize);
    const selectedPopulation = selectedIndices.map(
      (index) => population[index]
    );

    // Create new population
    const newPopulation: Individual[] = [];

    // Elitism: keep best individuals
    const sortedPopulation = [...population].sort(
      (a, b) => b.fitnessScore - a.fitnessScore
    );
    newPopulation.push(...sortedPopulation.slice(0, eliteCount));

    // Crossover and mutation
    while (newPopulation.length < populationSize) {
      const parent1 =
        selectedPopulation[
          Math.floor(Math.random() * selectedPopulation.length)
        ];
      const parent2 =
        selectedPopulation[
          Math.floor(Math.random() * selectedPopulation.length)
        ];

      const [child1, child2] = crossover(parent1, parent2, crossoverRate);

      newPopulation.push(mutate(child1, mutationRate, config.processes));
      if (newPopulation.length < populationSize) {
        newPopulation.push(mutate(child2, mutationRate, config.processes));
      }
    }

    // Update population
    population.length = 0;
    population.push(...newPopulation);
  }

  // Return the best individual found during evolution
  if (bestIndividualSoFar) {
    return bestIndividualSoFar;
  }

  // Fallback: return best from current population
  return population.reduce((best, current) =>
    current.fitnessScore > best.fitnessScore ? current : best
  );
};
