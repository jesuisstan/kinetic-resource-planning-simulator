import { Parser } from './parser';
import * as fs from 'fs';

function verifyTrace(config: any, traceLines: string[]): void {
  const stocks = new Map(config.stocks);
  let lastTime = 0;

  for (const line of traceLines) {
    const [timeStr, processName] = line.split(':');
    const time = parseInt(timeStr, 10);
    const process = config.processes.get(processName);

    if (!process) {
      throw new Error(`Unknown process: ${processName}`);
    }

    if (time < lastTime) {
      throw new Error(`Invalid time flow: ${time} < ${lastTime}`);
    }

    // Check if we have enough resources
    for (const [resource, amount] of process.inputs) {
      const available = stocks.get(resource) || 0;
      if (available < amount) {
        throw new Error(
          `Not enough ${resource} at time ${time} (need ${amount}, have ${available})`
        );
      }
      stocks.set(resource, Number(available) - Number(amount));
    }

    // Add produced resources
    for (const [resource, amount] of process.outputs) {
      const current = stocks.get(resource) || 0;
      stocks.set(resource, current + amount);
    }

    lastTime = time;
  }

  console.log('Logs successfully verified.');
  console.log('------------------------------------------');
  console.log('Stocks :');
  for (const [stock, amount] of stocks) {
    console.log(`  ${stock} => ${amount}`);
  }
  console.log('------------------------------------------');
  console.log(`Last cycle : ${lastTime}`);
}

function main() {
  if (process.argv.length < 4) {
    console.error('Usage: npm run verify -- <config_file> <logs_file>');
    process.exit(1);
  }

  const configFile = process.argv[2];
  const logsFile = process.argv[3];

  try {
    const parser = new Parser(configFile);
    const config = parser.parse();
    const trace = fs.readFileSync(logsFile, 'utf8').trim().split('\n');

    verifyTrace(config, trace);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'An error occurred'
    );
    process.exit(1);
  }
}

main();
