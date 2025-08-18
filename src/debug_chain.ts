import { Config } from './types';
import { Parser } from './parser';
import { runSimulation } from './simulator';
import { createSmartIndividual } from './geneticAlgorithm';
import { canStartProcess, updateStocksAfterProcess } from './simulator';

function debugProcessChain(filePath: string, timeLimit: number) {
  console.log('🔍 ANALYSIS OF PROCESS EXECUTION CHAIN LOGIC');
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

  // Process priority building
  console.log('🎯 PROCESS PRIORITIES:');
  console.log('(Priorities are calculated within the genetic algorithm)');
  for (const process of config.processes) {
    console.log(`  ${process.name}: available`);
  }
  console.log();

  // Creating smart individual
  console.log('🧬 CREATING SMART INDIVIDUAL:');
  const smartIndividual = createSmartIndividual(config, 8, 30);
  console.log(
    `Process sequence: ${smartIndividual.processSequence.join(' → ')}`
  );
  console.log();

  // Step-by-step simulation execution
  console.log('🔄 STEP-BY-STEP EXECUTION:');
  const processMap = new Map(config.processes.map((p) => [p.name, p]));
  let stocks = new Map(config.stocks.map((s) => [s.name, s.quantity]));
  let currentTime = 0;
  let step = 1;

  for (const processName of smartIndividual.processSequence) {
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
    smartIndividual.processSequence,
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
}

// Run with command line arguments
if (process.argv.length < 4) {
  console.error('Usage: npm run debug -- <filename> <delay>');
  process.exit(1);
}

const filePath = process.argv[2];
const timeLimit = parseInt(process.argv[3]);

if (isNaN(timeLimit) || timeLimit <= 0) {
  console.error('Error: Delay must be a positive integer.');
  process.exit(1);
}

debugProcessChain(filePath, timeLimit);
