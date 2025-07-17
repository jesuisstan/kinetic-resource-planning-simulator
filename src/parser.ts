import { Config, Process } from './types';
import * as fs from 'fs';

export class Parser {
  private optimizeFound: boolean = false;

  constructor(private filename: string) {}

  parse(): Config {
    const config: Config = {
      stocks: new Map(),
      processes: new Map(),
      optimizeGoals: []
    };

    const lines = fs
      .readFileSync(this.filename, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    // First pass: parse all lines
    for (let i = 0; i < lines.length; i++) {
      try {
        this.parseLine(lines[i], config);
      } catch (error) {
        throw new Error(
          `Error at line ${i + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Validation checks
    this.validateConfig(config);

    return config;
  }

  private validateConfig(config: Config): void {
    // Check for at least one stock
    if (config.stocks.size === 0) {
      throw new Error('No initial stocks defined');
    }

    // Check for at least one process
    if (config.processes.size === 0) {
      throw new Error('No processes defined');
    }

    // Check for negative stocks
    for (const [name, quantity] of config.stocks) {
      if (quantity < 0) {
        throw new Error(
          `Negative initial stock quantity for '${name}': ${quantity}`
        );
      }
    }

    // Check for unknown resources in process needs
    const availableResources = new Set<string>();

    // Add initial stocks to available resources
    for (const [name] of config.stocks) {
      availableResources.add(name);
    }

    // Add process outputs to available resources
    for (const process of config.processes.values()) {
      for (const [name] of process.outputs) {
        availableResources.add(name);
      }
    }

    // Check process needs against available resources
    for (const [processName, process] of config.processes) {
      for (const [resourceName] of process.inputs) {
        if (!availableResources.has(resourceName)) {
          throw new Error(
            `Process '${processName}' requires unknown resource '${resourceName}'`
          );
        }
      }
    }

    // Check optimization goals
    if (!this.optimizeFound) {
      throw new Error('No optimization goals defined');
    }

    for (const goal of config.optimizeGoals) {
      if (goal !== 'time' && !availableResources.has(goal)) {
        throw new Error(`Unknown resource in optimization goals: '${goal}'`);
      }
    }
  }

  private parseLine(line: string, config: Config): void {
    const [firstPart, ...rest] = line.split(':');
    const remainingLine = rest.join(':');

    if (firstPart === 'optimize') {
      if (this.optimizeFound) {
        throw new Error('Multiple optimize lines found');
      }
      this.optimizeFound = true;

      const goals = remainingLine
        .trim()
        .replace(/[()]/g, '')
        .split(';')
        .map((g) => g.trim())
        .filter((g) => g);

      if (goals.length === 0) {
        throw new Error('No optimization goals specified');
      }

      config.optimizeGoals = goals;
      return;
    }

    if (remainingLine.includes('(')) {
      // Process definition
      const process: Process = {
        name: firstPart,
        inputs: new Map(),
        outputs: new Map(),
        nbCycle: 0
      };

      // Check for duplicate process
      if (config.processes.has(process.name)) {
        throw new Error(`Duplicate process name: '${process.name}'`);
      }

      // Handle empty outputs case (marked with '#' or '::')
      if (remainingLine.includes('#') || remainingLine.includes('::')) {
        const matches = remainingLine.match(/\((.*?)\):.*?:(\d+)/);
        if (!matches) {
          throw new Error('Invalid process format');
        }
        const [_, inputsPart, cyclesPart] = matches;
        process.inputs = this.parseResourceList(inputsPart);
        process.nbCycle = parseInt(cyclesPart, 10);
      } else {
        // Regular process with outputs
        const matches = remainingLine.match(/\((.*?)\):\((.*?)\):(\d+)/);
        if (!matches) {
          throw new Error('Invalid process format');
        }
        const [_, inputsPart, outputsPart, cyclesPart] = matches;
        process.inputs = this.parseResourceList(inputsPart);
        process.outputs = this.parseResourceList(outputsPart);
        process.nbCycle = parseInt(cyclesPart, 10);
      }

      if (isNaN(process.nbCycle) || process.nbCycle <= 0) {
        throw new Error(`Invalid cycle count: ${process.nbCycle}`);
      }

      config.processes.set(process.name, process);
    } else {
      // Stock definition
      const quantity = parseInt(remainingLine, 10);
      if (isNaN(quantity)) {
        throw new Error(`Invalid stock quantity: ${remainingLine}`);
      }

      // Check for duplicate stock
      if (config.stocks.has(firstPart)) {
        throw new Error(`Duplicate stock name: '${firstPart}'`);
      }

      config.stocks.set(firstPart, quantity);
    }
  }

  private parseResourceList(input: string): Map<string, number> {
    const resources = new Map<string, number>();

    input = input.trim();
    if (!input) return resources;

    const pairs = input.split(';');
    for (const pair of pairs) {
      if (!pair.trim()) continue;
      const [name, quantityStr] = pair.split(':').map((s) => s.trim());
      if (!name || !quantityStr) {
        throw new Error(`Invalid resource format: ${pair}`);
      }
      const quantity = parseInt(quantityStr, 10);

      if (isNaN(quantity)) {
        throw new Error(`Invalid quantity for resource ${name}`);
      }

      if (quantity <= 0) {
        throw new Error(
          `Non-positive quantity for resource ${name}: ${quantity}`
        );
      }

      // Check for duplicate resource in the same list
      if (resources.has(name)) {
        throw new Error(`Duplicate resource in list: ${name}`);
      }

      resources.set(name, quantity);
    }

    return resources;
  }
}
