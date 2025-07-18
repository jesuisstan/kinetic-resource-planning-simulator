import { Config, Process, Individual, MT19937State } from './types';
import {
  canStartProcess,
  updateStocksAfterProcess,
  runSimulation
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

// Pure function to create a smart individual
export const createSmartIndividual = (
  processes: readonly Process[],
  processMap: ReadonlyMap<string, Process>,
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
      canStartProcess(p, stocks)
    );
    if (availableProcesses.length === 0) break;

    // Score processes based on their outputs
    const scores = new Map<Process, number>();
    for (const process of availableProcesses) {
      let score = 0;
      // Prefer processes that produce goal resources
      for (const [output] of process.outputs) {
        if (config.optimizeGoals.includes(output)) {
          score += 100;
        }
      }

      // Prefer processes that produce inputs for other processes
      for (const [output] of process.outputs) {
        for (const otherProcess of processes) {
          for (const [input] of otherProcess.inputs) {
            if (output === input) {
              score += 10;
              // Extra points if the other process produces goal resources
              for (const [otherOutput] of otherProcess.outputs) {
                if (config.optimizeGoals.includes(otherOutput)) {
                  score += 20;
                }
              }
            }
          }
        }
      }

      // Prefer processes with more outputs
      score += Array.from(process.outputs.values()).reduce((a, b) => a + b, 0);
      // Prefer shorter cycle times
      score += 10 / (process.nbCycle + 1);
      scores.set(process, score);
    }

    // Sort processes by score
    const sortedProcesses = [...availableProcesses].sort(
      (a, b) => (scores.get(b) || 0) - (scores.get(a) || 0)
    );

    // Pick from top 3 processes
    const topN = Math.min(3, sortedProcesses.length);
    const [index, newRng] = randomInt(currentRng, 0, topN - 1);
    currentRng = newRng;
    const process = sortedProcesses[index];

    // Add process to sequence
    sequence.push(process.name);
    stocks = updateStocksAfterProcess(process, stocks);
  }

  // If sequence is too short, pad with random processes
  if (sequence.length < minSequenceLength) {
    const processNames = Array.from(processMap.keys());
    while (sequence.length < minSequenceLength) {
      const [index, newRng] = randomInt(currentRng, 0, processNames.length - 1);
      currentRng = newRng;
      sequence.push(processNames[index]);
    }
  }

  return [{ processSequence: sequence, fitnessScore: 0 }, currentRng];
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

  return [{ processSequence: sequence, fitnessScore: 0 }, currentRng];
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
    // All individuals have the same fitness or no valid fitness
    const parents: number[] = [];
    let currentRng = rng;
    for (let i = 0; i < populationSize; i++) {
      const [index, newRng] = randomInt(currentRng, 0, population.length - 1);
      parents.push(index);
      currentRng = newRng;
    }
    return [parents, currentRng];
  }

  // Normalize fitness scores to [0, 1]
  const normalizedFitness = population.map((individual) =>
    isFinite(individual.fitnessScore)
      ? (individual.fitnessScore - minFitness) / (maxFitness - minFitness)
      : 0
  );

  // Select parents using roulette wheel selection
  const parents: number[] = [];
  let currentRng = rng;
  for (let i = 0; i < populationSize; i++) {
    const [random, newRng] = randomFloat(currentRng);
    currentRng = newRng;
    let sum = 0;
    for (let j = 0; j < population.length; j++) {
      sum += normalizedFitness[j];
      if (sum >= random) {
        parents.push(j);
        break;
      }
    }
    if (parents.length <= i) {
      parents.push(population.length - 1);
    }
  }

  return [parents, currentRng];
};

// Pure function to crossover two individuals
export const crossover = (
  parent1: Individual,
  parent2: Individual,
  crossoverRate: number,
  rng: MT19937State
): [[Individual, Individual], MT19937State] => {
  let currentRng = rng;
  const [random, rng2] = randomFloat(currentRng);
  currentRng = rng2;

  if (random > crossoverRate) {
    return [
      [
        { processSequence: [...parent1.processSequence], fitnessScore: 0 },
        { processSequence: [...parent2.processSequence], fitnessScore: 0 }
      ],
      currentRng
    ];
  }

  const [point1, rng3] = randomInt(
    currentRng,
    0,
    parent1.processSequence.length - 1
  );
  currentRng = rng3;
  const [point2, rng4] = randomInt(
    currentRng,
    0,
    parent2.processSequence.length - 1
  );
  currentRng = rng4;

  const child1 = [
    ...parent1.processSequence.slice(0, point1),
    ...parent2.processSequence.slice(point2)
  ];
  const child2 = [
    ...parent2.processSequence.slice(0, point2),
    ...parent1.processSequence.slice(point1)
  ];

  return [
    [
      { processSequence: child1, fitnessScore: 0 },
      { processSequence: child2, fitnessScore: 0 }
    ],
    currentRng
  ];
};

// Pure function to mutate an individual
export const mutate = (
  individual: Individual,
  processes: readonly Process[],
  mutationRate: number,
  minSequenceLength: number,
  rng: MT19937State
): [Individual, MT19937State] => {
  let currentRng = rng;
  const sequence = [...individual.processSequence];

  // For each position in sequence
  for (let i = 0; i < sequence.length; i++) {
    const [random, rng2] = randomFloat(currentRng);
    currentRng = rng2;

    if (random < mutationRate) {
      // Replace with random process
      const [index, rng3] = randomInt(currentRng, 0, processes.length - 1);
      currentRng = rng3;
      sequence[i] = processes[index].name;
    }
  }

  // Ensure minimum length
  while (sequence.length < minSequenceLength) {
    const [index, newRng] = randomInt(currentRng, 0, processes.length - 1);
    currentRng = newRng;
    sequence.push(processes[index].name);
  }

  return [{ processSequence: sequence, fitnessScore: 0 }, currentRng];
};

// Pure function to evolve population
export const evolvePopulation = (
  config: Config,
  timeLimit: number,
  generations: number = 100,
  populationSize: number = 100,
  mutationRate: number = 0.05,
  crossoverRate: number = 0.7,
  eliteCount: number = 4,
  minSequenceLength: number = 5,
  maxSequenceLength: number = 100
): Individual => {
  console.log(
    'Starting genetic algorithm evolution for',
    generations,
    'generations...'
  );

  // Initialize RNG
  let rng = createMT19937State(Date.now());

  // Create initial population
  let population: Individual[] = [];
  const smartCount = Math.floor(populationSize * 0.8);
  const randomCount = populationSize - smartCount;

  console.log(
    `Population initialized with ${populationSize} individuals: ${smartCount} smart, ${randomCount} random.`
  );

  // Create smart individuals
  for (let i = 0; i < smartCount; i++) {
    const [individual, newRng] = createSmartIndividual(
      config.processes,
      new Map(config.processes.map((p) => [p.name, p])),
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
  for (let i = 0; i < randomCount; i++) {
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

  // Evaluate initial population
  for (const individual of population) {
    const result = runSimulation(config, individual.processSequence, timeLimit);
    individual.fitnessScore = result.fitness;
  }

  // Sort by fitness (descending)
  population.sort((a, b) => b.fitnessScore - a.fitnessScore);

  // Evolution loop
  for (let generation = 0; generation < generations; generation++) {
    // Select parents
    const [parentIndices, rng2] = selectParents(
      population,
      populationSize,
      rng
    );
    rng = rng2;

    // Create next generation
    const nextGeneration: Individual[] = [];

    // Add elite individuals
    for (let i = 0; i < eliteCount && i < population.length; i++) {
      nextGeneration.push({
        processSequence: [...population[i].processSequence],
        fitnessScore: population[i].fitnessScore
      });
    }

    // Create children
    while (nextGeneration.length < populationSize) {
      // Select parents
      const parent1 = population[parentIndices[nextGeneration.length]];
      const parent2 =
        population[parentIndices[(nextGeneration.length + 1) % populationSize]];

      // Crossover
      const [[child1, child2], rng3] = crossover(
        parent1,
        parent2,
        crossoverRate,
        rng
      );
      rng = rng3;

      // Mutate children
      const [mutatedChild1, rng4] = mutate(
        child1,
        config.processes,
        mutationRate,
        minSequenceLength,
        rng
      );
      rng = rng4;
      const [mutatedChild2, rng5] = mutate(
        child2,
        config.processes,
        mutationRate,
        minSequenceLength,
        rng
      );
      rng = rng5;

      // Add children to next generation
      nextGeneration.push(mutatedChild1);
      if (nextGeneration.length < populationSize) {
        nextGeneration.push(mutatedChild2);
      }
    }

    // Evaluate next generation
    for (const individual of nextGeneration) {
      const result = runSimulation(
        config,
        individual.processSequence,
        timeLimit
      );
      individual.fitnessScore = result.fitness;
    }

    // Sort by fitness (descending)
    nextGeneration.sort((a, b) => b.fitnessScore - a.fitnessScore);

    // Replace population
    population = nextGeneration;
  }

  return population[0];
};
