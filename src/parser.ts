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
    const seenProcessNames = new Set<string>();
    const seenStockNames = new Set<string>();

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
              // Check for duplicate process names
              if (seenProcessNames.has(name)) {
                throw new Error(`Duplicate process name: '${name}'`);
              }
              seenProcessNames.add(name);

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
            // Check for negative stock quantities
            if (amount < 0) {
              throw new Error(
                `Negative stock quantity for '${name}': ${amount}`
              );
            }

            // Check for duplicate stock names
            if (seenStockNames.has(name)) {
              throw new Error(`Duplicate stock name: '${name}'`);
            }
            seenStockNames.add(name);

            stocks.push({
              name,
              quantity: amount
            });
          }
        }
      }
    }

    // Validate configuration
    this.validateConfig(processes, stocks, optimizeGoals);

    return { processes, stocks, optimizeGoals };
  }

  private validateConfig(
    processes: Process[],
    stocks: Stock[],
    optimizeGoals: string[]
  ): void {
    // Check if there are any processes
    if (processes.length === 0) {
      throw new Error('No processes defined in configuration');
    }

    // Check if there are any stocks
    if (stocks.length === 0) {
      throw new Error('No stocks defined in configuration');
    }

    // Create a set of all available resources (initial stocks + produced by processes)
    const availableResources = new Set(stocks.map((s) => s.name));

    // Add resources that are produced by processes
    for (const process of processes) {
      for (const [resource] of process.outputs) {
        availableResources.add(resource);
      }
    }

    // Check if all process inputs reference available resources
    for (const process of processes) {
      for (const [resource] of process.inputs) {
        if (!availableResources.has(resource)) {
          throw new Error(
            `Process '${process.name}' requires unknown resource: '${resource}'`
          );
        }
      }
    }

    // Check if all optimize goals reference available resources (except 'time')
    for (const goal of optimizeGoals) {
      if (goal !== 'time' && !availableResources.has(goal)) {
        throw new Error(`Unknown optimization goal: '${goal}'`);
      }
    }
  }
}
