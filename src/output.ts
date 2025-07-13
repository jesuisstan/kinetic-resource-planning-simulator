import { SimulationResult, StepLog } from './simulator';

export const printSimulationResult = (result: SimulationResult): void => {
  // Step-by-step log
  console.log('Step-by-step simulation log:');
  result.stepLogs.forEach((step: StepLog) => {
    const stocksB = Object.entries(step.stocksBefore)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    const stocksA = Object.entries(step.stocksAfter)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    console.log(`Time: ${step.time}`);
    console.log(`  Started: ${step.started.join(', ') || '-'}`);
    console.log(`  Finished: ${step.finished.join(', ') || '-'}`);
    console.log(`  Stocks before: ${stocksB || '-'}`);
    console.log(`  Stocks after:  ${stocksA || '-'}`);
    console.log('----');
  });
  // Trace log
  result.trace.forEach((entry) => {
    console.log(`${entry.cycle}:${entry.process}`);
  });
  // Final stocks
  console.log('----');
  console.log('Stock :');
  Object.entries(result.finalStocks).forEach(([name, qty]) => {
    console.log(`${name} => ${qty}`);
  });
  console.log('---------------------');
  console.log(`Total simulation cycles: ${result.lastCycle}`);
};
