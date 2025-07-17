import { SimulationResult } from './simulator';

export const printSimulationResult = (result: SimulationResult): void => {
  // Print process execution order
  console.log('Main walk:');
  result.processOrder.forEach(([process, time]) => {
    console.log(`${time}:${process}`);
  });

  if (result.isFinite) {
    console.log(`no more process doable at time ${result.totalTime + 1}`);
  }

  // Print final stocks
  console.log('----');
  console.log('Stock:');
  Object.entries(result.finalStocks).forEach(([name, qty]) => {
    console.log(`${name} => ${qty}`);
  });
  console.log('------------------------------');
  console.log(`Total simulation time: ${result.totalTime}`);
  console.log('------------------------------');
};
