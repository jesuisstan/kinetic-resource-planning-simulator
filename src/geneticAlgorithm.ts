import { Config, Individual, Process, MT19937State } from './types';
import {
  runSimulation,
  canStartProcess,
  updateStocksAfterProcess,
  calculateProcessEfficiency
} from './simulator';

// Pure function to create MT19937 state
export const createMT19937State = (seed: number): MT19937State => {
  const mt = new Array(624);
  mt[0] = seed >>> 0;
  for (let i = 1; i < 624; i++) {
    mt[i] = (1812433253 * (mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0;
  }
  return { mt, mti: 624 };
};

// Pure function to generate next random number
export const nextMT19937 = (state: MT19937State): [number, MT19937State] => {
  let { mt, mti } = state;
  mt = [...mt];

  if (mti >= 624) {
    for (let k = 0; k < 624 - 397; k++) {
      const y = (mt[k] & 0x80000000) | (mt[k + 1] & 0x7fffffff);
      mt[k] = mt[k + 397] ^ (y >>> 1) ^ (y & 0x1 ? 0x9908b0df : 0);
    }
    for (let k = 624 - 397; k < 623; k++) {
      const y = (mt[k] & 0x80000000) | (mt[k + 1] & 0x7fffffff);
      mt[k] = mt[k - (624 - 397)] ^ (y >>> 1) ^ (y & 0x1 ? 0x9908b0df : 0);
    }
    const y = (mt[623] & 0x80000000) | (mt[0] & 0x7fffffff);
    mt[623] = mt[396] ^ (y >>> 1) ^ (y & 0x1 ? 0x9908b0df : 0);
    mti = 0;
  }

  let y = mt[mti++];
  y ^= y >>> 11;
  y ^= (y << 7) & 0x9d2c5680;
  y ^= (y << 15) & 0xefc60000;
  y ^= y >>> 18;

  return [y >>> 0, { mt, mti }];
};

// Pure function to get random number between 0 and 1
export const randomFloat = (state: MT19937State): [number, MT19937State] => {
  const [next, newState] = nextMT19937(state);
  return [next / 0x100000000, newState];
};

// Pure function to get random integer between min and max (inclusive)
export const randomInt = (
  state: MT19937State,
  min: number,
  max: number
): [number, MT19937State] => {
  const [float, newState] = randomFloat(state);
  return [Math.floor(float * (max - min + 1)) + min, newState];
};

// Helper to find processes that can be started with initial resources
const findInitialProcesses = (
  processes: readonly Process[],
  stocks: ReadonlyMap<string, number>
): Process[] => {
  return processes.filter((p) => {
    // Check if all inputs are available in initial stocks
    for (const [resource, required] of p.inputs) {
      const available = stocks.get(resource) || 0;
      if (available < required) return false;
    }
    return true;
  });
};

// Helper to find resource buying processes
const findBuyingProcesses = (processes: readonly Process[]): Process[] => {
  return processes.filter((p) => p.name.startsWith('buy_'));
};

// Pure function to create a smart individual
export const createSmartIndividual = (
  processes: readonly Process[],
  processMap: ReadonlyMap<string, Process>,
  priority: ReadonlyMap<string, number>,
  config: Config,
  timeLimit: number,
  maxSequenceLength: number,
  minSequenceLength: number,
  rng: MT19937State
): [Individual, MT19937State] => {
  const sequence: string[] = [];
  let stocks = new Map(config.stocks.map((s) => [s.name, s.quantity]));
  let currentRng = rng;
  let attempts = 0;

  // Try to build a sequence that produces optimization goals
  while (
    sequence.length < maxSequenceLength &&
    attempts++ < maxSequenceLength * 2
  ) {
    // Find available processes
    const availableProcesses = processes.filter((p) =>
      canStartProcess(p, stocks, [], 0)
    );

    if (availableProcesses.length === 0) break;

    // Find best process based on priority and cycle time
    const bestProcess = availableProcesses.reduce((best, current) => {
      const bestPriority = priority.get(best.name) ?? 3;
      const currentPriority = priority.get(current.name) ?? 3;

      if (bestPriority !== currentPriority) {
        return bestPriority < currentPriority ? best : current;
      }
      return best.nbCycle < current.nbCycle ? best : current;
    }, availableProcesses[0]);

    // Add process to sequence
    sequence.push(bestProcess.name);
    stocks = updateStocksAfterProcess(bestProcess, stocks);
  }

  // Pad sequence if needed
  if (sequence.length < minSequenceLength && sequence.length > 0) {
    while (sequence.length < minSequenceLength) {
      const [idx, newRng] = randomInt(currentRng, 0, sequence.length - 1);
      sequence.push(sequence[idx]);
      currentRng = newRng;
    }
  }

  const result = runSimulation(config, sequence, timeLimit);
  return [
    { processSequence: sequence, fitnessScore: result.fitness },
    currentRng
  ];
};

// Pure function to create a random individual
export const createRandomIndividual = (
  processes: readonly Process[],
  config: Config,
  timeLimit: number,
  minSequenceLength: number,
  maxSequenceLength: number,
  rng: MT19937State
): [Individual, MT19937State] => {
  let currentRng = rng;
  const [len, rng2] = randomInt(
    currentRng,
    minSequenceLength,
    maxSequenceLength
  );
  currentRng = rng2;

  const sequence: string[] = [];
  for (let i = 0; i < len; i++) {
    const [idx, newRng] = randomInt(currentRng, 0, processes.length - 1);
    sequence.push(processes[idx].name);
    currentRng = newRng;
  }

  const result = runSimulation(config, sequence, timeLimit);
  return [
    { processSequence: sequence, fitnessScore: result.fitness },
    currentRng
  ];
};

// Pure function to select parents
export const selectParents = (
  population: readonly Individual[],
  populationSize: number,
  rng: MT19937State
): [number[], MT19937State] => {
  if (population.length === 0) return [[], rng];

  let minFitness = Number.MAX_VALUE;
  let maxFitness = Number.MIN_VALUE;

  for (const individual of population) {
    if (isFinite(individual.fitnessScore)) {
      minFitness = Math.min(minFitness, individual.fitnessScore);
      maxFitness = Math.max(maxFitness, individual.fitnessScore);
    }
  }

  if (
    minFitness === Number.MAX_VALUE ||
    maxFitness === Number.MIN_VALUE ||
    minFitness === maxFitness
  ) {
    const indices: number[] = [];
    let currentRng = rng;
    for (let i = 0; i < populationSize; i++) {
      const [idx, newRng] = randomInt(currentRng, 0, population.length - 1);
      indices.push(idx);
      currentRng = newRng;
    }
    return [indices, currentRng];
  }

  const range = maxFitness - minFitness;
  const normalizedFitness: number[] = [];
  let total = 0;

  for (const individual of population) {
    const normalized = isFinite(individual.fitnessScore)
      ? (individual.fitnessScore - minFitness) / range + 0.001
      : 0.001;
    normalizedFitness.push(normalized);
    total += normalized;
  }

  const cumulative: number[] = [];
  let sum = 0;
  for (const val of normalizedFitness) {
    sum += val;
    cumulative.push(sum);
  }

  const selectedIndices: number[] = [];
  let currentRng = rng;

  for (let i = 0; i < populationSize; i++) {
    const [float, newRng] = randomFloat(currentRng);
    currentRng = newRng;
    const randomPoint = float * total;
    let idx = cumulative.findIndex((val) => val >= randomPoint);
    if (idx === -1) idx = population.length - 1;
    selectedIndices.push(idx);
  }

  return [selectedIndices, currentRng];
};

// Pure function to perform crossover
export const crossover = (
  parent1: Individual,
  parent2: Individual,
  crossoverRate: number,
  rng: MT19937State
): [[Individual, Individual], MT19937State] => {
  const [float, rng2] = randomFloat(rng);
  if (float > crossoverRate) {
    return [[parent1, parent2], rng2];
  }

  const seq1 = parent1.processSequence;
  const seq2 = parent2.processSequence;
  const len1 = seq1.length;
  const len2 = seq2.length;
  const shortLen = Math.min(len1, len2);

  if (len1 < 2 || len2 < 2) {
    return [[parent1, parent2], rng2];
  }

  const [pointA, rng3] = randomInt(rng2, 0, shortLen - 1);
  const [pointB, rng4] = randomInt(rng3, 0, shortLen - 1);

  const actualPointA = Math.min(pointA, pointB);
  const actualPointB =
    pointA === pointB ? (pointA + 1) % shortLen : Math.max(pointA, pointB);

  const child1: string[] = [];
  const child2: string[] = [];

  // Build child1
  child1.push(...seq1.slice(0, actualPointA));
  if (actualPointB < len2) {
    child1.push(...seq2.slice(actualPointA, actualPointB));
  } else if (actualPointA < len2) {
    child1.push(...seq2.slice(actualPointA));
  }
  if (actualPointB < len1) {
    child1.push(...seq1.slice(actualPointB));
  }

  // Build child2
  child2.push(...seq2.slice(0, actualPointA));
  if (actualPointB < len1) {
    child2.push(...seq1.slice(actualPointA, actualPointB));
  } else if (actualPointA < len1) {
    child2.push(...seq1.slice(actualPointA));
  }
  if (actualPointB < len2) {
    child2.push(...seq2.slice(actualPointB));
  }

  return [
    [
      { processSequence: child1, fitnessScore: 0 },
      { processSequence: child2, fitnessScore: 0 }
    ],
    rng4
  ];
};

// Pure function to perform mutation
export const mutate = (
  individual: Individual,
  processes: readonly Process[],
  mutationRate: number,
  minSequenceLength: number,
  rng: MT19937State
): [Individual, MT19937State] => {
  const sequence = [...individual.processSequence];
  let currentRng = rng;

  // Point mutations
  for (let i = 0; i < sequence.length; i++) {
    const [float, newRng] = randomFloat(currentRng);
    currentRng = newRng;
    if (float < mutationRate) {
      const [idx, newRng2] = randomInt(currentRng, 0, processes.length - 1);
      sequence[i] = processes[idx].name;
      currentRng = newRng2;
    }
  }

  // Structural mutations
  const structuralRate = 0.02;
  const [float, newRng] = randomFloat(currentRng);
  currentRng = newRng;

  if (float < structuralRate && sequence.length > 1) {
    const [pos, newRng2] = randomInt(currentRng, 0, sequence.length);
    currentRng = newRng2;

    const [float2, newRng3] = randomFloat(currentRng);
    currentRng = newRng3;

    if (float2 < 0.5 && sequence.length > minSequenceLength) {
      // Remove process
      if (pos < sequence.length) {
        sequence.splice(pos, 1);
      }
    } else {
      // Add process
      const [idx, newRng4] = randomInt(currentRng, 0, processes.length - 1);
      sequence.splice(pos, 0, processes[idx].name);
      currentRng = newRng4;
    }
  }

  return [{ processSequence: sequence, fitnessScore: 0 }, currentRng];
};

// Pure function to evolve population
export const evolvePopulation = (
  config: Config,
  timeLimit: number,
  generations: number = 100,
  populationSize: number = 100,
  mutationRate: number = 0.1,
  crossoverRate: number = 0.8,
  eliteCount: number = 4,
  minSequenceLength: number = 10,
  maxSequenceLength: number = 50
): Individual => {
  console.log(
    `Starting genetic algorithm evolution for ${generations} generations...`
  );

  // Initialize RNG
  let rng = createMT19937State(Date.now());

  // Create process map and priority
  const processMap = new Map(config.processes.map((p) => [p.name, p]));
  const priority = new Map<string, number>();

  // Initialize population
  let population: Individual[] = [];
  const smartCount = Math.floor(populationSize * 0.8);

  console.log(
    `Population initialized with ${populationSize} individuals: ${smartCount} smart, ${
      populationSize - smartCount
    } random.`
  );

  // Create smart individuals
  for (let i = 0; i < smartCount; i++) {
    const [individual, newRng] = createSmartIndividual(
      config.processes,
      processMap,
      priority,
      config,
      timeLimit,
      maxSequenceLength,
      minSequenceLength,
      rng
    );
    population.push(individual);
    rng = newRng;
  }

  // Create random individuals
  for (let i = smartCount; i < populationSize; i++) {
    const [individual, newRng] = createRandomIndividual(
      config.processes,
      config,
      timeLimit,
      minSequenceLength,
      maxSequenceLength,
      rng
    );
    population.push(individual);
    rng = newRng;
  }

  let bestOverall = population[0];
  bestOverall.fitnessScore = Number.MIN_VALUE;

  // Evolution loop
  for (let generation = 0; generation < generations; generation++) {
    // Evaluate population
    population = population.map((individual) => ({
      ...individual,
      fitnessScore: runSimulation(config, individual.processSequence, timeLimit)
        .fitness
    }));

    // Find best individual
    const currentBest = population.reduce((a, b) =>
      a.fitnessScore > b.fitnessScore ? a : b
    );

    if (
      generation === 0 ||
      currentBest.fitnessScore > bestOverall.fitnessScore
    ) {
      bestOverall = currentBest;
      console.log(
        `Generation ${generation + 1}/${generations} - New Best Fitness: ${
          bestOverall.fitnessScore
        }`
      );
    }

    // Create next generation
    const newPopulation: Individual[] = [];

    // Add elite individuals
    population.sort((a, b) => b.fitnessScore - a.fitnessScore);
    for (let i = 0; i < eliteCount && i < population.length; i++) {
      newPopulation.push(population[i]);
    }

    // Select parents
    const [parentIndices, newRng] = selectParents(
      population,
      populationSize,
      rng
    );
    rng = newRng;

    if (parentIndices.length === 0) {
      if (populationSize > eliteCount) {
        while (newPopulation.length < populationSize) {
          newPopulation.push(
            population.length === 0
              ? createSmartIndividual(
                  config.processes,
                  processMap,
                  priority,
                  config,
                  timeLimit,
                  maxSequenceLength,
                  minSequenceLength,
                  rng
                )[0]
              : population[0]
          );
        }
      }
      population = newPopulation;
      continue;
    }

    // Create new individuals through crossover and mutation
    while (newPopulation.length < populationSize) {
      const [idx1, rng2] = randomInt(rng, 0, parentIndices.length - 1);
      const [idx2, rng3] = randomInt(rng2, 0, parentIndices.length - 1);
      rng = rng3;

      let tries = 0;
      let parent1Idx = parentIndices[idx1];
      let parent2Idx = parentIndices[idx2];

      while (
        parent1Idx === parent2Idx &&
        parentIndices.length > 1 &&
        tries++ < 10
      ) {
        const [newIdx, newRng] = randomInt(rng, 0, parentIndices.length - 1);
        parent2Idx = parentIndices[newIdx];
        rng = newRng;
      }

      if (parent1Idx >= population.length || parent2Idx >= population.length) {
        continue;
      }

      const [[child1, child2], rng4] = crossover(
        population[parent1Idx],
        population[parent2Idx],
        crossoverRate,
        rng
      );
      rng = rng4;

      const [mutatedChild1, rng5] = mutate(
        child1,
        config.processes,
        mutationRate,
        minSequenceLength,
        rng
      );
      rng = rng5;

      const [mutatedChild2, rng6] = mutate(
        child2,
        config.processes,
        mutationRate,
        minSequenceLength,
        rng
      );
      rng = rng6;

      if (newPopulation.length < populationSize) {
        newPopulation.push(mutatedChild1);
      }
      if (newPopulation.length < populationSize) {
        newPopulation.push(mutatedChild2);
      }
    }

    population = newPopulation;
  }

  // Final evaluation
  population = population.map((individual) => ({
    ...individual,
    fitnessScore: runSimulation(config, individual.processSequence, timeLimit)
      .fitness
  }));

  const finalBest = population.reduce((a, b) =>
    a.fitnessScore > b.fitnessScore ? a : b
  );

  if (finalBest.fitnessScore > bestOverall.fitnessScore) {
    bestOverall = finalBest;
  }

  console.log(
    `Evolution finished! Final best fitness score: ${bestOverall.fitnessScore.toFixed(
      3
    )}`
  );
  console.log('------------------------------------------');
  return bestOverall;
};
