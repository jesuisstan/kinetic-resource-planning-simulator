import { Config } from './src/types';
import { Parser } from './src/parser';
import { runSimulation } from './src/simulator';
import { evolvePopulation } from './src/geneticAlgorithm';
import { canStartProcess, updateStocksAfterProcess } from './src/simulator';

function debugOptimalChain(filePath: string, timeLimit: number) {
  console.log('🔍 ANALYSIS OF OPTIMAL PROCESS EXECUTION CHAIN');
  console.log('='.repeat(80));

  const parser = new Parser();
  const config = parser.parse(filePath);

  console.log(`📁 File: ${filePath}`);
  console.log(`⏱️  Time limit: ${timeLimit}`);
  console.log(`🎯 Optimization goals: ${config.optimizeGoals.join(', ')}`);
  console.log();

  // Analysis of initial resources
  console.log('📦 INITIAL RESOURCES:');
  for (const stock of config.stocks) {
    console.log(`  ${stock.name}: ${stock.quantity}`);
  }
  console.log();

  // Analysis of processes
  console.log('⚙️  AVAILABLE PROCESSES:');
  for (const process of config.processes) {
    const inputs = Array.from(process.inputs.entries())
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    const outputs = Array.from(process.outputs.entries())
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    console.log(`  ${process.name}:`);
    console.log(`    Inputs: ${inputs}`);
    console.log(`    Outputs: ${outputs}`);
    console.log(`    Duration: ${process.nbCycle} cycles`);
    console.log();
  }

  // Analysis of dependencies
  console.log('🔗 ANALYSIS OF PROCESS DEPENDENCIES:');
  const processMap = new Map(config.processes.map((p) => [p.name, p]));

  for (const process of config.processes) {
    console.log(`\n📋 ${process.name}:`);

    // What this process requires
    if (process.inputs.size > 0) {
      console.log(`  🔽 Requires:`);
      for (const [resource, quantity] of process.inputs) {
        const initial =
          config.stocks.find((s) => s.name === resource)?.quantity || 0;
        console.log(
          `    ${resource}: ${quantity} (initially available: ${initial})`
        );
      }
    }

    // What this process produces
    if (process.outputs.size > 0) {
      console.log(`  🔼 Produces:`);
      for (const [resource, quantity] of process.outputs) {
        const isGoal = config.optimizeGoals.includes(resource);
        console.log(`    ${resource}: ${quantity}${isGoal ? ' 🎯' : ''}`);
      }
    }
  }
  console.log();

  // Search for optimal solution using genetic algorithm
  console.log('🧬 SEARCHING FOR OPTIMAL SOLUTION:');

  // Genetic algorithm parameters
  const processCount = config.processes.length;
  const stockCount = config.stocks.length;
  const goalCount = config.optimizeGoals.length;
  const hasCyclicProcesses = config.processes.some((p: any) => {
    const outputs = new Set(p.outputs.keys());
    return Array.from(p.inputs.keys()).some((input) => outputs.has(input));
  });

  const complexityScore = Math.min(
    100,
    processCount * 10 +
      stockCount * 5 +
      goalCount * 10 +
      (hasCyclicProcesses ? 20 : 0)
  );

  const generations = Math.max(
    80,
    Math.min(400, Math.floor(complexityScore * 4))
  );
  const populationSize = Math.max(
    80,
    Math.min(400, Math.floor(complexityScore * 4))
  );
  const mutationRate = Math.min(0.15, 0.05 + complexityScore * 0.0008);
  const crossoverRate = Math.max(
    0.7,
    Math.min(0.9, 0.7 + complexityScore * 0.0015)
  );
  const eliteCount = Math.max(5, Math.floor(populationSize * 0.1));
  const minSequenceLength = Math.max(8, Math.floor(processCount * 0.8));
  const maxSequenceLength = Math.min(100, processCount * 3);

  console.log(`Algorithm parameters:`);
  console.log(`  Generations: ${generations}`);
  console.log(`  Population size: ${populationSize}`);
  console.log(`  Mutation rate: ${mutationRate}`);
  console.log(`  Crossover rate: ${crossoverRate}`);
  console.log();

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

  console.log(`✅ Found optimal sequence:`);
  console.log(`   ${bestIndividual.processSequence.join(' → ')}`);
  console.log();

  // Step-by-step execution of optimal sequence
  console.log('🔄 STEP-BY-STEP EXECUTION OF OPTIMAL SEQUENCE:');
  let stocks = new Map(config.stocks.map((s) => [s.name, s.quantity]));
  let currentTime = 0;
  let step = 1;

  for (const processName of bestIndividual.processSequence) {
    const process = processMap.get(processName);
    if (!process) {
      console.log(`❌ Процесс "${processName}" не найден`);
      continue;
    }

    console.log(`\n📋 Step ${step}: ${processName}`);
    console.log(`⏰ Time: ${currentTime}`);
    console.log(`📊 Current resources:`);
    for (const [resource, quantity] of stocks) {
      console.log(`    ${resource}: ${quantity}`);
    }

    // Check if process can be executed
    const canStart = canStartProcess(process, stocks, {
      processes: config.processes,
      stocks: config.stocks
    });

    if (!canStart) {
      console.log(`❌ Process "${processName}" CANNOT BE EXECUTED`);
      console.log(`   Reasons:`);
      for (const [resource, required] of process.inputs) {
        const available = stocks.get(resource) || 0;
        if (available < required) {
          console.log(
            `   - Insufficient ${resource}: need ${required}, available ${available}`
          );
        }
      }
      continue;
    }

    // Execute process
    console.log(`✅ Executing process "${processName}"`);
    console.log(
      `   Consumes: ${Array.from(process.inputs.entries())
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')}`
    );
    console.log(
      `   Produces: ${Array.from(process.outputs.entries())
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')}`
    );

    stocks = updateStocksAfterProcess(process, stocks, {
      processes: config.processes,
      stocks: config.stocks
    });

    currentTime += process.nbCycle;
    console.log(`⏰ New time: ${currentTime}`);
    console.log(`📊 Updated resources:`);
    for (const [resource, quantity] of stocks) {
      console.log(`    ${resource}: ${quantity}`);
    }

    step++;

    if (currentTime >= timeLimit) {
      console.log(`⏰ Time limit ${timeLimit} reached`);
      break;
    }
  }

  // Final simulation
  console.log('\n' + '='.repeat(80));
  console.log('🎯 FINAL SIMULATION:');
  const result = runSimulation(
    config,
    bestIndividual.processSequence,
    timeLimit
  );

  console.log(`📈 Fitness score: ${result.fitness}`);
  console.log(`⏰ Final time: ${result.finalCycle}`);
  console.log(`⏱️  Time limit reached: ${result.timeoutReached}`);
  console.log(`📝 Number of executed processes: ${result.executionLog.length}`);

  console.log('\n📋 COMPLETE EXECUTION SEQUENCE:');
  if (result.executionLog.length === 0) {
    console.log('(No processes were executed)');
  } else {
    for (const [cycle, processName] of result.executionLog) {
      console.log(`  ${cycle}:${processName}`);
    }
  }

  console.log('\n📦 FINAL RESOURCES:');
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
    const initial =
      config.stocks.find((s) => s.name === stockName)?.quantity || 0;
    const final = result.finalStocks.get(stockName) || 0;
    const change = final - initial;
    const changeStr = change > 0 ? `+${change}` : change.toString();
    console.log(`  ${stockName}: ${initial} → ${final} (${changeStr})`);
  }

  console.log('\n🎯 ANALYSIS OF GOAL ACHIEVEMENT:');
  for (const goal of config.optimizeGoals) {
    if (goal !== 'time') {
      const initial = config.stocks.find((s) => s.name === goal)?.quantity || 0;
      const final = result.finalStocks.get(goal) || 0;
      const produced = final - initial;
      console.log(`  ${goal}: produced ${produced} units`);
    }
  }

  // Efficiency analysis
  console.log('\n📊 EFFICIENCY ANALYSIS:');
  if (result.executionLog.length > 0) {
    const totalTime = result.finalCycle;
    const processesExecuted = result.executionLog.length;
    const avgTimePerProcess = totalTime / processesExecuted;

    console.log(`  Total execution time: ${totalTime} cycles`);
    console.log(`  Number of executed processes: ${processesExecuted}`);
    console.log(
      `  Average time per process: ${avgTimePerProcess.toFixed(1)} cycles`
    );

    // Time usage analysis
    const timeEfficiency = totalTime / timeLimit;
    console.log(`  Time usage: ${(timeEfficiency * 100).toFixed(1)}%`);

    if (timeEfficiency < 0.5) {
      console.log(`  💡 Optimization opportunity: lots of free time`);
    } else if (timeEfficiency > 0.9) {
      console.log(`  ⚠️  Warning: time limit almost exhausted`);
    } else {
      console.log(`  ✅ Good time usage`);
    }
  }
}

// Run with command line arguments
if (process.argv.length < 4) {
  console.error('Usage: npm run debug-optimal -- <filename> <delay>');
  process.exit(1);
}

const filePath = process.argv[2];
const timeLimit = parseInt(process.argv[3]);

if (isNaN(timeLimit) || timeLimit <= 0) {
  console.error('Error: Delay must be a positive integer.');
  process.exit(1);
}

debugOptimalChain(filePath, timeLimit);
