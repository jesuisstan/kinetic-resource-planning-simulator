import { Config, Individual, Process, ResourceDiff } from './types';

export class GeneticAlgorithm {
  private readonly populationSize = 100;
  private readonly smartIndividuals = 80;
  private readonly generations = 100;
  private readonly mutationRate = 0.1;

  constructor(private config: Config, private maxTime: number) {}

  evolve(): Individual {
    console.log(
      `Starting genetic algorithm evolution for ${this.generations} generations...`
    );
    console.log(
      `Population initialized with ${this.populationSize} individuals: ${
        this.smartIndividuals
      } smart, ${this.populationSize - this.smartIndividuals} random.`
    );

    let population = this.initializePopulation();
    let bestIndividual = this.findBestIndividual(population);
    let bestFitness = bestIndividual.fitness;

    console.log(
      `Generation 1/${
        this.generations
      } - New Best Fitness: ${bestFitness.toFixed(6)}`
    );

    for (let gen = 2; gen <= this.generations; gen++) {
      population = this.evolvePopulation(population);
      const currentBest = this.findBestIndividual(population);

      if (currentBest.fitness > bestFitness) {
        bestFitness = currentBest.fitness;
        bestIndividual = currentBest;
        console.log(
          `Generation ${gen}/${
            this.generations
          } - New Best Fitness: ${bestFitness.toFixed(6)}`
        );
      }
    }

    console.log(
      'Evolution finished. Final best fitness:',
      bestFitness.toFixed(6)
    );
    return bestIndividual;
  }

  private initializePopulation(): Individual[] {
    const population: Individual[] = [];

    // Generate smart individuals
    for (let i = 0; i < this.smartIndividuals; i++) {
      population.push(this.generateSmartIndividual());
    }

    // Generate random individuals
    for (let i = this.smartIndividuals; i < this.populationSize; i++) {
      population.push(this.generateRandomIndividual());
    }

    return population;
  }

  private generateSmartIndividual(): Individual {
    const genes: Individual['genes'] = [];
    const stocks = new Map(this.config.stocks);
    let time = 0;
    let lastProcessTime = 0;
    let noProgressCount = 0;
    let maxNoProgress = 10; // Increased to give more chances to find valid processes

    // Continue until we can't make progress or hit time limit
    while (time < this.maxTime && noProgressCount < maxNoProgress) {
      const availableProcesses = Array.from(
        this.config.processes.entries()
      ).filter(([_, process]) => this.canRunProcess(process, stocks));

      if (availableProcesses.length === 0) {
        noProgressCount++;
        time++; // Increment time to allow resources to accumulate
        continue;
      }

      // Prioritize processes that produce optimization goals or required resources
      const scoredProcesses = availableProcesses.map(([name, process]) => {
        let score = 0;

        // Score for producing optimization goals
        for (const [resource, amount] of process.outputs) {
          if (this.config.optimizeGoals.includes(resource)) {
            score += amount * 2; // Double score for optimization goals
          }
        }

        // Score for producing resources needed by other processes
        for (const [resource, amount] of process.outputs) {
          for (const [_, otherProcess] of this.config.processes) {
            if (otherProcess !== process) {
              for (const [neededResource] of otherProcess.inputs) {
                if (neededResource === resource) {
                  score += amount;
                  break;
                }
              }
            }
          }
        }

        return { name, process, score };
      });

      // Sort by score but keep some randomness
      scoredProcesses.sort((a, b) => b.score - a.score);
      const topProcesses = scoredProcesses.slice(
        0,
        Math.max(3, Math.floor(scoredProcesses.length * 0.3))
      );

      const { name: processName, process } =
        topProcesses[Math.floor(Math.random() * topProcesses.length)];

      const maxAmount = this.calculateMaxAmount(process, stocks);
      const amount = Math.max(
        1,
        Math.floor(maxAmount * (0.5 + Math.random() * 0.5))
      );
      const parallel = Math.random() > 0.5 && genes.length > 0;

      genes.push({ process: processName, amount, parallel });

      // Update time based on parallel execution
      if (parallel) {
        time = Math.max(time, lastProcessTime + process.nbCycle);
      } else {
        time += process.nbCycle;
      }
      lastProcessTime = time;

      this.updateStocks(process, stocks, amount);
      noProgressCount = 0;
    }

    return {
      genes,
      fitness: this.calculateFitness(genes)
    };
  }

  private generateRandomIndividual(): Individual {
    const genes: Individual['genes'] = [];
    const processNames = Array.from(this.config.processes.keys());
    const length = Math.floor(Math.random() * 20) + 1; // 1-20 genes

    for (let i = 0; i < length; i++) {
      genes.push({
        process: processNames[Math.floor(Math.random() * processNames.length)],
        amount: Math.floor(Math.random() * 5) + 1, // 1-5 amount
        parallel: Math.random() > 0.5
      });
    }

    return {
      genes,
      fitness: this.calculateFitness(genes)
    };
  }

  private evolvePopulation(population: Individual[]): Individual[] {
    const newPopulation: Individual[] = [];

    // Elitism - keep best 10%
    const eliteCount = Math.floor(this.populationSize * 0.1);
    const sortedPopulation = [...population].sort(
      (a, b) => b.fitness - a.fitness
    );
    newPopulation.push(...sortedPopulation.slice(0, eliteCount));

    // Fill rest with crossover and mutation
    while (newPopulation.length < this.populationSize) {
      const parent1 = this.tournamentSelect(population);
      const parent2 = this.tournamentSelect(population);
      let child = this.crossover(parent1, parent2);

      if (Math.random() < this.mutationRate) {
        child = this.mutate(child);
      }

      newPopulation.push(child);
    }

    return newPopulation;
  }

  private tournamentSelect(population: Individual[]): Individual {
    const tournamentSize = 5;
    let best = population[Math.floor(Math.random() * population.length)];

    for (let i = 1; i < tournamentSize; i++) {
      const contender =
        population[Math.floor(Math.random() * population.length)];
      if (contender.fitness > best.fitness) {
        best = contender;
      }
    }

    return best;
  }

  private crossover(parent1: Individual, parent2: Individual): Individual {
    const crossPoint = Math.floor(
      Math.random() * Math.min(parent1.genes.length, parent2.genes.length)
    );
    const genes = [
      ...parent1.genes.slice(0, crossPoint),
      ...parent2.genes.slice(crossPoint)
    ];

    return {
      genes,
      fitness: this.calculateFitness(genes)
    };
  }

  private mutate(individual: Individual): Individual {
    const genes = [...individual.genes];
    const processNames = Array.from(this.config.processes.keys());

    // Random mutation type
    switch (Math.floor(Math.random() * 4)) {
      case 0: // Change process
        if (genes.length > 0) {
          const idx = Math.floor(Math.random() * genes.length);
          genes[idx] = {
            ...genes[idx],
            process:
              processNames[Math.floor(Math.random() * processNames.length)]
          };
        }
        break;

      case 1: // Change amount
        if (genes.length > 0) {
          const idx = Math.floor(Math.random() * genes.length);
          genes[idx] = {
            ...genes[idx],
            amount: Math.floor(Math.random() * 5) + 1
          };
        }
        break;

      case 2: // Add gene
        genes.push({
          process:
            processNames[Math.floor(Math.random() * processNames.length)],
          amount: Math.floor(Math.random() * 5) + 1,
          parallel: Math.random() > 0.5
        });
        break;

      case 3: // Remove gene
        if (genes.length > 1) {
          genes.splice(Math.floor(Math.random() * genes.length), 1);
        }
        break;
    }

    return {
      genes,
      fitness: this.calculateFitness(genes)
    };
  }

  private calculateFitness(genes: Individual['genes']): number {
    const stocks = new Map(this.config.stocks);
    let time = 0;
    let score = 0;
    let lastProcessTime = 0;
    let completedOptimizationGoals = 0;

    for (const gene of genes) {
      const process = this.config.processes.get(gene.process);
      if (!process) continue;

      // Check if we can run all instances of this process
      let canRunAll = true;
      for (const [resource, amount] of process.inputs) {
        const available = stocks.get(resource) || 0;
        if (available < amount * gene.amount) {
          canRunAll = false;
          break;
        }
      }

      if (!canRunAll) {
        score -= 10; // Heavy penalty for impossible process
        continue;
      }

      // Update time based on parallel execution
      if (gene.parallel) {
        time = Math.max(time, lastProcessTime + process.nbCycle);
      } else {
        time += process.nbCycle;
      }
      lastProcessTime = time;

      // Update stocks
      this.updateStocks(process, stocks, gene.amount);

      // Calculate score based on optimization goals
      for (const goal of this.config.optimizeGoals) {
        if (goal === 'time') {
          score += 1 / (time + 1); // Higher score for shorter time
        } else {
          const amount = stocks.get(goal) || 0;
          if (amount > 0) {
            completedOptimizationGoals++;
            score += amount * 2; // Double score for optimization goals
          }
        }
      }
    }

    // Heavy bonus for completing all optimization goals
    if (completedOptimizationGoals === this.config.optimizeGoals.length) {
      score *= 2;
    }

    // Penalize longer execution times, but less severely
    score = score / Math.sqrt(time + 1);

    return score;
  }

  private canRunProcess(
    process: Process,
    stocks: Map<string, number>
  ): boolean {
    // Check if we have all required inputs
    for (const [resource, needed] of process.inputs) {
      const available = stocks.get(resource) || 0;
      if (available < needed) {
        return false;
      }
    }

    // Check if running this process would produce any optimization goals
    // or resources needed by other processes
    let isUseful = false;

    // Check if it produces optimization goals
    for (const [resource] of process.outputs) {
      if (this.config.optimizeGoals.includes(resource)) {
        isUseful = true;
        break;
      }
    }

    // Check if it produces resources needed by other processes
    if (!isUseful) {
      for (const [resource] of process.outputs) {
        for (const [_, otherProcess] of this.config.processes) {
          if (otherProcess !== process) {
            for (const [neededResource] of otherProcess.inputs) {
              if (neededResource === resource) {
                isUseful = true;
                break;
              }
            }
          }
          if (isUseful) break;
        }
        if (isUseful) break;
      }
    }

    return isUseful;
  }

  private calculateMaxAmount(
    process: Process,
    stocks: Map<string, number>
  ): number {
    let maxAmount = Number.MAX_SAFE_INTEGER;

    for (const [resource, amount] of process.inputs) {
      const available = stocks.get(resource) || 0;
      maxAmount = Math.min(maxAmount, Math.floor(available / amount));
    }

    return Math.max(1, Math.min(maxAmount, 5)); // Cap at 5 for reasonable solutions
  }

  private updateStocks(
    process: Process,
    stocks: Map<string, number>,
    amount: number
  ): void {
    // First subtract all inputs
    for (const [resource, needed] of process.inputs) {
      const current = stocks.get(resource) || 0;
      stocks.set(resource, current - needed * amount);
    }

    // Then add all outputs
    for (const [resource, produced] of process.outputs) {
      const current = stocks.get(resource) || 0;
      stocks.set(resource, current + produced * amount);
    }

    // Verify no negative stocks
    for (const [resource, quantity] of stocks) {
      if (quantity < 0) {
        throw new Error(`Negative stock for ${resource}: ${quantity}`);
      }
    }
  }

  private findBestIndividual(population: Individual[]): Individual {
    return population.reduce((best, current) =>
      current.fitness > best.fitness ? current : best
    );
  }
}
