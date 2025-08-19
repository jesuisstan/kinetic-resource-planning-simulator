import { Config } from './types';
import { evolvePopulation } from './geneticAlgorithm';
import { runSimulation } from './simulator';
import { Parser } from './parser';
import * as fs from 'fs';

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

  const parser = new Parser();
  const config = parser.parse(filePath);

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
  const hasCyclicProcesses = config.processes.some((p: any) => {
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
  console.log(`Goals: ${goalCount} (${config.optimizeGoals.join(', ')})`);
  console.log(`Has Cyclic Processes: ${hasCyclicProcesses}`);
  console.log();

  // Calculate parameters based on complexity (increased for better exploration)
  const generations = Math.max(
    200,
    Math.min(600, Math.floor(complexityScore * 6))
  );
  const populationSize = Math.max(
    150,
    Math.min(600, Math.floor(complexityScore * 6))
  );
  const mutationRate = Math.min(0.2, 0.08 + complexityScore * 0.001);
  const crossoverRate = Math.max(
    0.75,
    Math.min(0.95, 0.75 + complexityScore * 0.002)
  );
  const eliteCount = Math.max(15, Math.floor(populationSize * 0.15));
  const minSequenceLength = Math.max(15, Math.floor(processCount * 1.2));
  const maxSequenceLength = Math.min(150, processCount * 4); // Increased for complex chains

  console.log('Genetic Algorithm Parameters:');
  console.log(`Generations: ${generations}`);
  console.log(`Population Size: ${populationSize}`);
  console.log(`Mutation Rate: ${mutationRate}`);
  console.log(`Crossover Rate: ${crossoverRate}`);
  console.log(`Elite Count: ${eliteCount}`);
  console.log(`Min Sequence Length: ${minSequenceLength}`);
  console.log(`Max Sequence Length: ${maxSequenceLength}`);
  console.log('------------------------------------------');

  const bestIndividual = evolvePopulation(
    config,
    timeLimit,
    generations,
    populationSize,
    mutationRate,
    crossoverRate,
    eliteCount,
    minSequenceLength,
    maxSequenceLength,
    complexityScore
  );

  const result = runSimulation(
    config,
    bestIndividual.processSequence,
    timeLimit
  );

  console.log('------------------------------------------');
  console.log('Main walk :');
  if (result.executionLog.length === 0) {
    console.log('(No processes executed)');
  } else {
    // todo uncomment later
    //for (const [cycle, processName] of result.executionLog) {
    //  console.log(`${cycle}:${processName}`);
    //}

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

  console.log('------------------------------------------');

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
