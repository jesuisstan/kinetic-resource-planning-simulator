#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="node" />

import * as fs from 'fs';
import { parseConfigFile, validateConfig } from './parser';
import { Process, Stock } from './parser';

interface TraceEntry {
  cycle: number;
  process: string;
}

const parseTrace = (path: string): TraceEntry[] => {
  const content = fs.readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).map((line: string) => line.trim());
  const trace: TraceEntry[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const [cycleStr, processName] = line
      .split(':')
      .map((str: string) => str.trim());
    const cycle = Number(cycleStr);
    if (isNaN(cycle) || !processName) {
      throw new Error(`Invalid trace line: ${line}`);
    }
    trace.push({ cycle, process: processName });
  }

  return trace;
};

const verifyTrace = (
  config: { stocks: Stock[]; processes: Process[] },
  trace: TraceEntry[]
): { valid: boolean; error?: string; finalStocks: Record<string, number> } => {
  // Initialize stocks
  const stocks: Record<string, number> = {};
  config.stocks.forEach((s) => {
    stocks[s.name] = s.quantity;
  });

  // Track running processes
  const running: { process: Process; finish: number }[] = [];

  // Process each trace entry
  for (const entry of trace) {
    // First, complete any processes that finish at this cycle
    const stillRunning: { process: Process; finish: number }[] = [];
    for (const r of running) {
      if (r.finish === entry.cycle) {
        // Apply results
        r.process.results.forEach((res) => {
          stocks[res.name] = (stocks[res.name] || 0) + res.quantity;
        });
      } else if (r.finish > entry.cycle) {
        stillRunning.push(r);
      }
    }
    running.length = 0;
    running.push(...stillRunning);

    // Find the process to start
    const process = config.processes.find((p) => p.name === entry.process);
    if (!process) {
      return {
        valid: false,
        error: `Unknown process at cycle ${entry.cycle}: ${entry.process}`,
        finalStocks: stocks
      };
    }

    // Check if we have enough resources to start the process
    for (const need of process.needs) {
      if ((stocks[need.name] || 0) < need.quantity) {
        return {
          valid: false,
          error: `Not enough ${need.name} to start ${process.name} at cycle ${entry.cycle}`,
          finalStocks: stocks
        };
      }
    }

    // Consume resources and start process
    process.needs.forEach((need) => {
      stocks[need.name] -= need.quantity;
    });
    running.push({
      process,
      finish: entry.cycle + process.delay
    });
  }

  // Complete any remaining processes
  const lastCycle = trace.length > 0 ? trace[trace.length - 1].cycle : 0;
  for (const r of running) {
    if (r.finish <= lastCycle) {
      r.process.results.forEach((res) => {
        stocks[res.name] = (stocks[res.name] || 0) + res.quantity;
      });
    }
  }

  return { valid: true, finalStocks: stocks };
};

const main = (): void => {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.log('Usage: npm run verif -- <config_file> <trace_file>');
    process.exit(1);
  }

  const [configFile, traceFile] = args;

  try {
    // Parse and validate config
    const config = parseConfigFile(configFile);
    validateConfig(config);

    // Parse and verify trace
    const trace = parseTrace(traceFile);
    const result = verifyTrace(config, trace);

    if (!result.valid) {
      console.error('❌ Invalid trace:', result.error);
    } else {
      console.log('✅ Valid trace!');
    }

    console.log('\nFinal stocks:');
    Object.entries(result.finalStocks)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([name, qty]) => {
        console.log(`${name} => ${qty}`);
      });
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
};

main();
