import { Config, Individual, Process, MT19937State } from './types';
import {
  runSimulation,
  canStartProcess,
  updateStocksAfterProcess
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
  let runningProcesses: Array<{ processPtr: Process; completionTime: number }> =
    [];
  let currentTime = 0;

  // First try to build a sequence that produces optimization goals
  const goalSet = new Set(config.optimizeGoals.filter((g) => g !== 'time'));
  const goalProducers = new Map<string, Process[]>();
  const goalDependencies = new Map<string, Set<string>>();

  // Find processes that directly or indirectly produce goal resources
  for (const goal of goalSet) {
    goalProducers.set(goal, []);
    goalDependencies.set(goal, new Set());

    // Direct producers
    for (const process of processes) {
      if (Array.from(process.outputs.keys()).includes(goal)) {
        goalProducers.get(goal)!.push(process);
        // Add input dependencies
        for (const [input] of process.inputs) {
          goalDependencies.get(goal)!.add(input);
        }
      }
    }
  }

  // Find processes that produce dependencies
  const dependencyProducers = new Map<string, Process[]>();
  const processedDeps = new Set<string>();

  const findDependencyProducers = (resource: string) => {
    if (processedDeps.has(resource)) return;
    processedDeps.add(resource);

    dependencyProducers.set(resource, []);
    for (const process of processes) {
      for (const [output, quantity] of process.outputs) {
        if (output === resource) {
          dependencyProducers.get(resource)!.push(process);
          // Recursively find producers for this process's inputs
          for (const [input] of process.inputs) {
            findDependencyProducers(input);
          }
        }
      }
    }
  };

  // Build dependency tree for all goals
  for (const goal of goalSet) {
    for (const dep of goalDependencies.get(goal)!) {
      findDependencyProducers(dep);
    }
  }

  // Identify cyclic processes (processes that produce their own inputs)
  const cyclicProcesses = new Set<Process>();
  for (const process of processes) {
    const inputs = new Set(process.inputs.keys());
    const outputs = new Set(process.outputs.keys());
    if (Array.from(inputs).some((input) => outputs.has(input))) {
      cyclicProcesses.add(process);
    }
  }

  // Try to accumulate resources efficiently
  const tryAccumulateResource = (
    resource: string,
    targetAmount: number,
    maxAttempts: number = 20,
    depth: number = 0,
    visited: Set<string> = new Set()
  ): boolean => {
    // Prevent infinite recursion
    if (depth > 5 || visited.has(resource)) {
      return false;
    }
    visited.add(resource);

    const producers = dependencyProducers.get(resource) || [];
    if (producers.length === 0) return false;

    let attempts = 0;
    while (
      (stocks.get(resource) || 0) < targetAmount &&
      attempts++ < maxAttempts &&
      sequence.length < maxSequenceLength
    ) {
      // Find best producer
      let bestProducer: Process | undefined;
      let maxOutput = 0;

      for (const producer of producers) {
        if (canStartProcess(producer, stocks, runningProcesses, currentTime)) {
          const output = producer.outputs.get(resource) || 0;
          const isCyclic = cyclicProcesses.has(producer);
          // Prioritize cyclic processes that can run immediately
          if (isCyclic || output > maxOutput) {
            maxOutput = output;
            bestProducer = producer;
            if (isCyclic) break; // Prefer cyclic processes
          }
        }
      }

      if (!bestProducer) {
        // Try to accumulate dependencies for the producers
        let foundDependency = false;
        for (const producer of producers) {
          for (const [input, required] of producer.inputs) {
            if ((stocks.get(input) || 0) < required) {
              foundDependency =
                tryAccumulateResource(
                  input,
                  required * 2,
                  5,
                  depth + 1,
                  visited
                ) || foundDependency;
            }
          }
        }
        if (!foundDependency) break;
        continue;
      }

      // Add process to sequence
      sequence.push(bestProducer.name);
      stocks = updateStocksAfterProcess(bestProducer, stocks);
      runningProcesses.push({
        processPtr: bestProducer,
        completionTime: currentTime + bestProducer.nbCycle
      });
      runningProcesses.sort((a, b) => a.completionTime - b.completionTime);
      currentTime++;

      // Complete any finished processes
      while (
        runningProcesses.length > 0 &&
        runningProcesses[0].completionTime <= currentTime
      ) {
        const finished = runningProcesses.shift()!;
        stocks = updateStocksAfterProcess(finished.processPtr, stocks);
      }
    }

    return (stocks.get(resource) || 0) >= targetAmount;
  };

  // Try to produce goals
  for (const goal of goalSet) {
    const producers = goalProducers.get(goal)!;
    if (producers.length === 0) continue;

    // Find the producer with the best output/input ratio
    let bestProducer = producers[0];
    let bestRatio = 0;

    for (const producer of producers) {
      const outputQty = producer.outputs.get(goal) || 0;
      const totalInputs = Array.from(producer.inputs.values()).reduce(
        (a, b) => a + b,
        0
      );
      const ratio = outputQty / (totalInputs || 1);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestProducer = producer;
      }
    }

    // Try to accumulate required resources
    for (const [resource, required] of bestProducer.inputs) {
      tryAccumulateResource(resource, required * 3, 20, 0, new Set()); // Try to get enough for at least 3 runs
    }

    // Try to run the producer multiple times
    let producerAttempts = 10;
    while (producerAttempts-- > 0 && sequence.length < maxSequenceLength) {
      if (
        canStartProcess(bestProducer, stocks, runningProcesses, currentTime)
      ) {
        sequence.push(bestProducer.name);
        stocks = updateStocksAfterProcess(bestProducer, stocks);
        runningProcesses.push({
          processPtr: bestProducer,
          completionTime: currentTime + bestProducer.nbCycle
        });
        runningProcesses.sort((a, b) => a.completionTime - b.completionTime);
        currentTime++;

        // Complete any finished processes
        while (
          runningProcesses.length > 0 &&
          runningProcesses[0].completionTime <= currentTime
        ) {
          const finished = runningProcesses.shift()!;
          stocks = updateStocksAfterProcess(finished.processPtr, stocks);
        }
      } else {
        // Try to accumulate more resources
        let canContinue = true;
        for (const [resource, required] of bestProducer.inputs) {
          if (!tryAccumulateResource(resource, required, 10, 0, new Set())) {
            canContinue = false;
            break;
          }
        }
        if (!canContinue) break;
      }
    }
  }

  // Then add supporting processes
  while (
    sequence.length < maxSequenceLength &&
    attempts++ < maxSequenceLength * 2 &&
    currentTime < timeLimit
  ) {
    // Complete any finished processes
    while (
      runningProcesses.length > 0 &&
      runningProcesses[0].completionTime <= currentTime
    ) {
      const finished = runningProcesses.shift()!;
      stocks = updateStocksAfterProcess(finished.processPtr, stocks);
    }

    // Find available processes
    const availableProcesses = processes.filter((p) =>
      canStartProcess(p, stocks, runningProcesses, currentTime)
    );

    if (availableProcesses.length === 0) {
      if (runningProcesses.length === 0) break;
      currentTime = runningProcesses[0].completionTime;
      continue;
    }

    // Group processes by priority
    const processByPriority = new Map<number, Process[]>();
    for (const process of availableProcesses) {
      const prio = priority.get(process.name) ?? 3;
      if (!processByPriority.has(prio)) {
        processByPriority.set(prio, []);
      }
      processByPriority.get(prio)!.push(process);
    }

    // Select process from highest priority group
    let selectedProcess: Process | undefined;
    for (let p = 0; p <= 3; p++) {
      const group = processByPriority.get(p);
      if (group && group.length > 0) {
        // Prefer cyclic processes in each priority group
        const cyclicInGroup = group.filter((p) => cyclicProcesses.has(p));
        if (cyclicInGroup.length > 0) {
          const [idx, newRng] = randomInt(
            currentRng,
            0,
            cyclicInGroup.length - 1
          );
          currentRng = newRng;
          selectedProcess = cyclicInGroup[idx];
        } else {
          const [idx, newRng] = randomInt(currentRng, 0, group.length - 1);
          currentRng = newRng;
          selectedProcess = group[idx];
        }
        break;
      }
    }

    if (!selectedProcess) break;

    // Add process to sequence and update state
    sequence.push(selectedProcess.name);
    stocks = updateStocksAfterProcess(selectedProcess, stocks);
    runningProcesses.push({
      processPtr: selectedProcess,
      completionTime: currentTime + selectedProcess.nbCycle
    });
    runningProcesses.sort((a, b) => a.completionTime - b.completionTime);
    currentTime++;
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
    `Evolution finished. Final best fitness: ${bestOverall.fitnessScore}`
  );
  return bestOverall;
};
