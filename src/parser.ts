// parser.ts
// Parser for the configuration file for the production chain simulator

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

function parseNeedsOrResults(
  str: string
): { name: string; quantity: number }[] {
  if (!str.trim()) return [];
  return str.split(';').map((pair) => {
    const [name, qty] = pair.split(':').map((s) => s.trim());
    if (!name || isNaN(Number(qty)))
      throw new Error(`Invalid need/result: ${pair}`);
    return { name, quantity: Number(qty) };
  });
}

export function parseConfigFile(path: string): ConfigData {
  const content = fs.readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const stocks: Stock[] = [];
  const processes: Process[] = [];
  let optimize: OptimizeGoal | null = null;

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('optimize:')) {
      const optStr = line.slice('optimize:'.length).replace(/[()]/g, '').trim();
      const parts = optStr.split(';').map((s) => s.trim());
      const time = parts.includes('time');
      const stocksOpt = parts.filter((s) => s !== 'time' && s.length > 0);
      optimize = { time, stocks: stocksOpt };
      continue;
    }
    if (line.includes(':') && !line.includes('(')) {
      // stock line
      const [name, qty] = line.split(':').map((s) => s.trim());
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
}

export function validateConfig(config: ConfigData): void {
  // TODO: implement structure validation (e.g., unique names, non-negative values, valid optimize)
  return;
}
