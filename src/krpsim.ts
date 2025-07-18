import { Config, Process, Stock } from './types';
import { evolvePopulation } from './geneticAlgorithm';
import { runSimulation } from './simulator';
import * as fs from 'fs';
import * as path from 'path';

function calculateMaxSequenceLength(config: Config, timeLimit: number): number {
  const processes = config.processes;
  const stocks = config.stocks;

  if (processes.length === 0) {
    return 100;
  }

  let avgCycle = 0;
  for (const process of processes) {
    avgCycle += process.nbCycle;
  }
  avgCycle /= processes.length;

  const estimatedProcesses = Math.floor(timeLimit / Math.max(1, avgCycle));
  const complexityFactor = 2.0 + stocks.length * 0.1 + processes.length * 0.2;
  const maxLength = Math.floor(estimatedProcesses * complexityFactor);

  const minValue = Math.max(100, estimatedProcesses);
  const maxValue = Math.min(20000, estimatedProcesses * 10);

  return Math.max(minValue, Math.min(maxValue, maxLength));
}

function parseFile(filePath: string): Config | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').map((line) => line.trim());

    const stocks: Stock[] = [];
    const processes: Process[] = [];
    const optimizeGoals: string[] = [];

    let currentSection = '';

    for (const line of lines) {
      // Skip empty lines and comments
      if (line === '' || line.startsWith('#')) {
        continue;
      }

      // Parse stock line
      if (line.includes(':') && !line.includes('(')) {
        const [name, quantity] = line.split(':').map((s) => s.trim());
        if (!isNaN(parseInt(quantity))) {
          stocks.push({ name, quantity: parseInt(quantity) });
        }
        continue;
      }

      // Parse process line
      const processMatch = line.match(/(\w+):\((.*?)\):\((.*?)\):(\d+)/);
      if (processMatch) {
        const [_, name, inputStr, outputStr, delay] = processMatch;

        // Parse inputs
        const inputs = new Map<string, number>();
        if (inputStr.trim()) {
          for (const input of inputStr.split(';')) {
            const [resource, quantity] = input.split(':').map((s) => s.trim());
            inputs.set(resource, parseInt(quantity));
          }
        }

        // Parse outputs
        const outputs = new Map<string, number>();
        if (outputStr.trim()) {
          for (const output of outputStr.split(';')) {
            const [resource, quantity] = output.split(':').map((s) => s.trim());
            outputs.set(resource, parseInt(quantity));
          }
        }

        processes.push({
          name,
          inputs,
          outputs,
          nbCycle: parseInt(delay)
        });
        continue;
      }

      // Parse optimize line
      const optimizeMatch = line.match(/optimize:\((.*?)\)/);
      if (optimizeMatch) {
        const goals = optimizeMatch[1].split(';').map((g) => g.trim());
        optimizeGoals.push(...goals);
      }
    }

    if (
      stocks.length === 0 &&
      processes.length === 0 &&
      optimizeGoals.length === 0
    ) {
      console.error('Error: No valid data found in file');
      return null;
    }

    return { stocks, processes, optimizeGoals };
  } catch (error) {
    console.error('Error parsing file:', error);
    return null;
  }
}

function main() {
  if (process.argv.length < 4) {
    console.error('Usage: npm run krpsim -- <filename> <delay>');
    process.exit(1);
  }

  const filePath = process.argv[2];
  const timeLimit = parseInt(process.argv[3]);

  if (isNaN(timeLimit) || timeLimit <= 0) {
    console.error('Error: Delay must be a positive integer.');
    process.exit(1);
  }

  const config = parseFile(filePath);
  if (!config) {
    process.exit(1);
  }

  console.log('------------------------------------------');
  console.log(
    `Nice file! ${config.processes.length} processes, ${config.stocks.length} initial stocks, ${config.optimizeGoals.length} optimization goal(s)`
  );
  console.log('------------------------------------------');
  console.log('Evaluating using Genetic Algorithm...');

  // Analyze problem complexity
  const processCount = config.processes.length;
  const stockCount = config.stocks.length;
  const goalCount = config.optimizeGoals.length;
  const hasCyclicProcesses = config.processes.some((p) => {
    const outputs = new Set(p.outputs.keys());
    return Array.from(p.inputs.keys()).some((input) => outputs.has(input));
  });

  // Calculate complexity score
  const complexityScore = Math.min(
    100,
    processCount * 10 +
      stockCount * 5 +
      goalCount * 10 +
      (hasCyclicProcesses ? 20 : 0)
  );

  console.log('Problem Analysis:');
  console.log(`Complexity Score: ${complexityScore}/100`);
  console.log(`Processes: ${processCount}`);
  console.log(`Stocks: ${stockCount}`);
  console.log(`Goals: ${goalCount}`);
  console.log(`Has Cyclic Processes: ${hasCyclicProcesses}`);
  console.log();

  // Match C++ version parameters
  const generations = 20;
  const populationSize = 20;
  const mutationRate = 0.05;
  const crossoverRate = 0.7;
  const eliteCount = 2;

  console.log('Genetic Algorithm Parameters:');
  console.log(`Generations: ${generations}`);
  console.log(`Population Size: ${populationSize}`);
  console.log(`Mutation Rate: ${mutationRate}`);
  console.log(`Crossover Rate: ${crossoverRate}`);
  console.log(`Elite Count: ${eliteCount}`);
  console.log(`Sequence Length: 5-100`);
  console.log('------------------------------------------');

  const bestIndividual = evolvePopulation(
    config,
    timeLimit,
    generations,
    populationSize,
    mutationRate,
    crossoverRate,
    eliteCount,
    5,
    100
  );

  const result = runSimulation(
    config,
    bestIndividual.processSequence,
    timeLimit
  );

  console.log('Main walk :');
  if (result.executionLog.length === 0) {
    console.log('(No processes executed)');
  } else {
    for (const [cycle, processName] of result.executionLog) {
      console.log(`${cycle}:${processName}`);
    }

    // Write to logs file
    const logsFilePath = 'logs.txt';
    try {
      const traceContent = result.executionLog
        .map(([cycle, processName]) => `${cycle}:${processName}`)
        .join('\n');
      fs.writeFileSync(logsFilePath, traceContent);
      console.log(`\n(Logged into file: ${logsFilePath})`);
    } catch (error) {
      console.error(`Warning: Could not write to file '${logsFilePath}'`);
    }
  }

  console.log('------------------------------------------');

  if (result.executionLog.length === 0) {
    console.log(
      `No process could be executed within the time limit (${timeLimit}).`
    );
  } else if (!result.timeoutReached && result.finalCycle < timeLimit) {
    console.log(`No more process doable at time ${result.finalCycle + 1}`);
  } else {
    console.log(`Simulation reached time limit at cycle ${timeLimit}.`);
  }

  console.log('Stocks :');
  const allStockNames = new Set<string>();
  for (const stock of config.stocks) {
    allStockNames.add(stock.name);
  }
  for (const process of config.processes) {
    for (const [resource] of process.inputs) {
      allStockNames.add(resource);
    }
    for (const [resource] of process.outputs) {
      allStockNames.add(resource);
    }
  }

  for (const stockName of Array.from(allStockNames).sort()) {
    console.log(`  ${stockName} => ${result.finalStocks.get(stockName) || 0}`);
  }
  console.log('------------------------------------------');
}

main();
