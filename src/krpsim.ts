import { Parser } from './parser';
import { GeneticAlgorithm } from './geneticAlgorithm';
import * as fs from 'fs';
import { Config, Individual } from './types';

function formatSolution(individual: Individual, config: Config): string[] {
  const result: string[] = [];
  const stocks = new Map(config.stocks);
  const processEndTimes = new Map<string, number>();
  const resourceAvailableTimes = new Map<string, number>();

  // Initialize resource available times with initial stocks
  for (const [resource] of stocks) {
    resourceAvailableTimes.set(resource, 0);
  }

  // First pass: calculate earliest possible start times based on dependencies
  const processStartTimes = new Map<string, number>();
  for (const gene of individual.genes) {
    const process = config.processes.get(gene.process);
    if (!process) continue;

    let earliestStart = 0;

    // Check when all required resources will be available
    for (const [resource] of process.inputs) {
      const resourceTime = resourceAvailableTimes.get(resource) || 0;
      earliestStart = Math.max(earliestStart, resourceTime);
    }

    processStartTimes.set(gene.process, earliestStart);
  }

  // Sort genes by start time and dependencies
  const sortedGenes = [...individual.genes].sort((a, b) => {
    const startA = processStartTimes.get(a.process) || 0;
    const startB = processStartTimes.get(b.process) || 0;
    if (startA !== startB) return startA - startB;

    // If start times are equal, prioritize processes that produce resources needed by others
    const procA = config.processes.get(a.process);
    const procB = config.processes.get(b.process);
    if (!procA || !procB) return 0;

    let scoreA = 0;
    let scoreB = 0;

    // Calculate how many other processes need the outputs of this process
    for (const [resource] of procA.outputs) {
      for (const [_, otherProc] of config.processes) {
        if (otherProc !== procA && otherProc.inputs.has(resource)) {
          scoreA++;
        }
      }
    }

    for (const [resource] of procB.outputs) {
      for (const [_, otherProc] of config.processes) {
        if (otherProc !== procB && otherProc.inputs.has(resource)) {
          scoreB++;
        }
      }
    }

    return scoreB - scoreA;
  });

  // Execute processes
  for (const gene of sortedGenes) {
    const process = config.processes.get(gene.process);
    if (!process) continue;

    // Check if we have enough resources
    let canRun = true;
    for (const [resource, needed] of process.inputs) {
      const available = stocks.get(resource) || 0;
      if (available < needed * gene.amount) {
        canRun = false;
        break;
      }
    }
    if (!canRun) continue;

    // Get start time based on resource availability
    let startTime = 0;
    for (const [resource] of process.inputs) {
      startTime = Math.max(
        startTime,
        resourceAvailableTimes.get(resource) || 0
      );
    }

    // Consume resources
    for (const [resource, amount] of process.inputs) {
      const current = stocks.get(resource) || 0;
      stocks.set(resource, current - amount * gene.amount);
    }

    // Add process executions
    for (let i = 0; i < gene.amount; i++) {
      result.push(`${startTime}:${gene.process}`);
    }

    // Calculate when resources will be available
    const endTime = startTime + process.nbCycle;
    for (const [resource, amount] of process.outputs) {
      const current = stocks.get(resource) || 0;
      stocks.set(resource, current + amount * gene.amount);
      resourceAvailableTimes.set(resource, endTime);
    }

    // Update process end time
    processEndTimes.set(gene.process, endTime);
  }

  // Sort result by time
  result.sort((a, b) => {
    const timeA = parseInt(a.split(':')[0]);
    const timeB = parseInt(b.split(':')[0]);
    return timeA - timeB;
  });

  return result;
}

function main() {
  if (process.argv.length < 4) {
    console.error('Usage: npm start -- <filename> <delay>');
    process.exit(1);
  }

  const filename = process.argv[2];
  const delay = parseInt(process.argv[3], 10);

  if (isNaN(delay) || delay <= 0) {
    console.error('Error: Delay must be a positive integer.');
    process.exit(1);
  }

  try {
    const parser = new Parser(filename);
    const config = parser.parse();

    console.log(
      `Nice file! ${config.processes.size} processes, ${config.stocks.size} initial stocks, ${config.optimizeGoals.length} optimization goal(s)`
    );
    console.log('------------------------------------------');

    console.log('Evaluating using Genetic Algorithm...');

    const ga = new GeneticAlgorithm(config, delay);
    const bestSolution = ga.evolve();

    console.log('Optimization complete.');
    console.log('------------------------------------------');
    console.log('Best solution found:');
    console.log(`Final Fitness Score: ${bestSolution.fitness.toFixed(3)}`);
    console.log('Main walk :');

    const solution = formatSolution(bestSolution, config);
    for (const line of solution) {
      console.log(line);
    }

    // Save to logs file
    fs.writeFileSync('logs.txt', solution.join('\n') + '\n');

    // Calculate final stocks
    const finalStocks = new Map(config.stocks);
    for (const gene of bestSolution.genes) {
      const process = config.processes.get(gene.process);
      if (process) {
        for (const [resource, amount] of process.inputs) {
          const current = finalStocks.get(resource) || 0;
          finalStocks.set(resource, current - amount * gene.amount);
        }
        for (const [resource, amount] of process.outputs) {
          const current = finalStocks.get(resource) || 0;
          finalStocks.set(resource, current + amount * gene.amount);
        }
      }
    }

    console.log('------------------------------------------');
    console.log(
      `No more process doable at time ${
        solution.length > 0
          ? (() => {
              const lastProcess = solution[solution.length - 1];
              const [startTime, processName] = lastProcess.split(':');
              const process = config.processes.get(processName);
              return process
                ? parseInt(startTime) + process.nbCycle
                : startTime;
            })()
          : 0
      }`
    );
    console.log('Stocks :');
    for (const [stock, amount] of finalStocks) {
      console.log(`  ${stock} => ${amount}`);
    }
    console.log('------------------------------------------');

    console.log('Logged into file: logs.txt');
    console.log('------------------------------------------');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'An error occurred');
    process.exit(1);
  }
}

main();
