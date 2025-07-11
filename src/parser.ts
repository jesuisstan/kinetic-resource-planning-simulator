// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="node" />
import * as fs from 'fs';

export interface Stock {
  name: string;
  quantity: number;
}

export interface Process {
  name: string;
  needs: { name: string; quantity: number }[];
  results: { name: string; quantity: number }[];
  delay: number;
}

export interface OptimizeGoal {
  time: boolean;
  stocks: string[];
}

export interface ConfigData {
  stocks: Stock[];
  processes: Process[];
  optimize: OptimizeGoal;
}

const parseNeedsOrResults = (
  str: string
): { name: string; quantity: number }[] => {
  if (!str.trim()) return [];
  return str.split(';').map((pair: string) => {
    const [name, qty] = pair.split(':').map((s: string) => s.trim());
    if (!name || isNaN(Number(qty)))
      throw new Error(`Invalid need/result: ${pair}`);
    return { name, quantity: Number(qty) };
  });
};

export const parseConfigFile = (path: string): ConfigData => {
  const content = fs.readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).map((l: string) => l.trim());
  const stocks: Stock[] = [];
  const processes: Process[] = [];
  let optimize: OptimizeGoal | null = null;

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('optimize:')) {
      const optStr = line.slice('optimize:'.length).replace(/[()]/g, '').trim();
      const parts = optStr.split(';').map((s: string) => s.trim());
      const time = parts.includes('time');
      const stocksOpt = parts.filter(
        (s: string) => s !== 'time' && s.length > 0
      );
      optimize = { time, stocks: stocksOpt };
      continue;
    }
    if (line.includes(':') && !line.includes('(')) {
      // stock line
      const [name, qty] = line.split(':').map((s: string) => s.trim());
      if (!name || isNaN(Number(qty)))
        throw new Error(`Invalid stock: ${line}`);
      stocks.push({ name, quantity: Number(qty) });
      continue;
    }
    // process line: <name>:(<need>:<qty>[;<need>:<qty>[...]]):(<result>:<qty>[;<result>:<qty>[...]]):<delay>
    const match = line.match(/^(\w+):\(([^)]*)\):\(([^)]*)\):(\d+)$/);
    if (!match) throw new Error(`Invalid process: ${line}`);
    const [, name, needsStr, resultsStr, delayStr] = match;
    const needs = parseNeedsOrResults(needsStr);
    const results = parseNeedsOrResults(resultsStr);
    const delay = Number(delayStr);
    if (!name || isNaN(delay)) throw new Error(`Invalid process: ${line}`);
    processes.push({ name, needs, results, delay });
  }
  if (!optimize) throw new Error('No optimize line found');
  return { stocks, processes, optimize };
};

export const validateConfig = (config: ConfigData): void => {
  // Check for at least one stock and one process
  if (config.stocks.length === 0) throw new Error('No stocks defined');
  if (config.processes.length === 0) throw new Error('No processes defined');

  // Check unique stock names
  const stockNames = config.stocks.map((s) => s.name);
  const stockNameSet = new Set(stockNames);
  if (stockNames.length !== stockNameSet.size)
    throw new Error('Duplicate stock names found');

  // Check unique process names
  const processNames = config.processes.map((p) => p.name);
  const processNameSet = new Set(processNames);
  if (processNames.length !== processNameSet.size)
    throw new Error('Duplicate process names found');

  // Check non-negative stock quantities
  config.stocks.forEach((s) => {
    if (!Number.isInteger(s.quantity) || s.quantity < 0)
      throw new Error(`Stock '${s.name}' has invalid quantity: ${s.quantity}`);
  });

  // Check non-negative process delays and needs/results
  config.processes.forEach((p) => {
    if (!Number.isInteger(p.delay) || p.delay < 0)
      throw new Error(`Process '${p.name}' has invalid delay: ${p.delay}`);
    p.needs.forEach((n) => {
      if (!Number.isInteger(n.quantity) || n.quantity < 0)
        throw new Error(
          `Process '${p.name}' need '${n.name}' has invalid quantity: ${n.quantity}`
        );
    });
    p.results.forEach((r) => {
      if (!Number.isInteger(r.quantity) || r.quantity < 0)
        throw new Error(
          `Process '${p.name}' result '${r.name}' has invalid quantity: ${r.quantity}`
        );
    });
  });

  // Collect all possible resource names: stocks + all results
  const resourceSet = new Set<string>(stockNames);
  config.processes.forEach((p) => {
    p.results.forEach((r) => {
      resourceSet.add(r.name);
    });
  });

  // Check that all needs refer to existing resources (stocks or results)
  config.processes.forEach((p) => {
    p.needs.forEach((n) => {
      if (!resourceSet.has(n.name))
        throw new Error(
          `Process '${p.name}' needs unknown resource '${n.name}'`
        );
    });
  });

  // Check that all optimize stocks exist (in stocks or results)
  config.optimize.stocks.forEach((opt) => {
    if (!resourceSet.has(opt))
      throw new Error(`Optimize goal refers to unknown resource '${opt}'`);
  });
};

export const printConfigSummary = (config: ConfigData): void => {
  console.log('Config loaded successfully!');
  console.log('Stocks:');
  config.stocks.forEach((stock) => {
    console.log(`  - ${stock.name}: ${stock.quantity}`);
  });
  console.log(`Processes (${config.processes.length}):`);
  config.processes.forEach((proc) => {
    const needs = proc.needs.map((n) => `${n.name}:${n.quantity}`).join('; ');
    const results = proc.results
      .map((r) => `${r.name}:${r.quantity}`)
      .join('; ');
    console.log(
      `  - ${proc.name}: needs [${needs || 'none'}] -> results [${
        results || 'none'
      }], delay ${proc.delay}`
    );
  });
  const goals = [
    config.optimize.time ? 'time' : null,
    ...config.optimize.stocks
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`Optimization goal: ${goals}`);
};
