import * as fs from 'fs';
import { Config, Process, Stock } from './types';

export class Parser {
  constructor() {}

  parse(filePath: string): Config {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const processes: Process[] = [];
    const stocks: Stock[] = [];
    const optimizeGoals: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine === '' || trimmedLine.startsWith('#')) continue;

      if (trimmedLine.startsWith('optimize:(')) {
        const goals = trimmedLine
          .substring(trimmedLine.indexOf('(') + 1, trimmedLine.lastIndexOf(')'))
          .split(';')
          .map((g) => g.trim())
          .filter((g) => g !== '');
        optimizeGoals.push(...goals);
        continue;
      }

      const parts = trimmedLine.split(':');
      if (parts.length >= 2) {
        const name = parts[0];
        const rest = parts.slice(1).join(':');

        if (rest.includes('(')) {
          // Process definition
          const matches = rest.match(/\((.*?)\):\((.*?)\):(\d+)/);
          if (matches) {
            const [_, inputsStr, outputsStr, cyclesStr] = matches;
            const inputs = new Map<string, number>();
            const outputs = new Map<string, number>();

            // Parse inputs
            if (inputsStr) {
              const inputPairs = inputsStr.split(';').filter((p) => p.trim());
              for (const pair of inputPairs) {
                const [resource, amount] = pair.trim().split(':');
                if (resource && amount) {
                  inputs.set(resource.trim(), parseInt(amount.trim()));
                }
              }
            }

            // Parse outputs
            if (outputsStr) {
              const outputPairs = outputsStr.split(';').filter((p) => p.trim());
              for (const pair of outputPairs) {
                const [resource, amount] = pair.trim().split(':');
                if (resource && amount) {
                  outputs.set(resource.trim(), parseInt(amount.trim()));
                }
              }
            }

            const cycles = parseInt(cyclesStr);
            if (!isNaN(cycles)) {
              processes.push({
                name,
                inputs,
                outputs,
                nbCycle: cycles
              });
            }
          }
        } else {
          // Stock definition
          const amount = parseInt(parts[1]);
          if (!isNaN(amount)) {
            stocks.push({
              name,
              quantity: amount
            });
          }
        }
      }
    }

    return { processes, stocks, optimizeGoals };
  }
}
