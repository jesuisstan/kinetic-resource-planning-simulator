import { Stock, Process, ProcessList } from './types';
import * as fs from 'fs';

export class StockManager {
  static update(
    stock: Stock,
    elements: Stock,
    operation: '+' | '-' = '+'
  ): void {
    for (const [key, value] of Object.entries(elements)) {
      if (operation === '+') {
        stock[key] = (stock[key] || 0) + value;
      } else if (operation === '-') {
        stock[key] = (stock[key] || 0) - value;
        if (stock[key] <= 0) {
          delete stock[key];
        }
      } else {
        throw new Error("Invalid operation. Use '+' or '-'.");
      }
    }
  }

  static printStock(stock: Stock, msg: string): void {
    console.log(msg);
    for (const [key, value] of Object.entries(stock)) {
      console.log(` ${key} => ${value}`);
    }
    console.log('');
  }
}

export class ProcessInitializer {
  static initializeStock(initialValues: Stock, stock: Stock): void {
    for (const [key, value] of Object.entries(initialValues)) {
      stock[key] = stock[key] || 0;
    }
  }

  static readProcessFile(
    filePath: string,
    stock: Stock,
    processList: ProcessList
  ): string {
    let optimizationTarget = '';
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Stock line: name:quantity
      const stockMatch = trimmedLine.match(/^(\w+):(\d+)$/);
      if (stockMatch) {
        const [, name, value] = stockMatch;
        stock[name] = parseInt(value);
        continue;
      }

      // Process line: name:(need1:qty1;need2:qty2):(result1:qty1;result2:qty2):delay
      const processMatch = trimmedLine.match(
        /^(\w+):\(([^)]*)\):\(([^)]*)\):(\d+)$/
      );
      if (processMatch) {
        const [, name, needsStr, resultsStr, delayStr] = processMatch;
        const process = this.createProcess(
          name,
          needsStr,
          resultsStr,
          parseInt(delayStr)
        );
        processList[process.name] = process;
        this.initializeStock(process.need, stock);
        this.initializeStock(process.result, stock);
        continue;
      }

      // Optimize line: optimize:(target1;target2)
      const optimizeMatch = trimmedLine.match(/^optimize:\(([^)]*)\)$/);
      if (optimizeMatch) {
        const targets = optimizeMatch[1].split(';');
        optimizationTarget = targets[targets.length - 1]; // Take the last target
        continue;
      }
    }

    if (!optimizationTarget || !(optimizationTarget in stock)) {
      ErrorManager.errorType('bad_file');
    }

    return optimizationTarget;
  }

  private static createProcess(
    name: string,
    needsStr: string,
    resultsStr: string,
    delay: number
  ): Process {
    const process: Process = {
      name,
      need: {},
      result: {},
      delay
    };

    // Parse needs
    if (needsStr) {
      const needs = needsStr.split(';');
      for (const need of needs) {
        const [item, quantity] = need.split(':');
        process.need[item] = parseInt(quantity);
      }
    }

    // Parse results
    if (resultsStr) {
      const results = resultsStr.split(';');
      for (const result of results) {
        const [item, quantity] = result.split(':');
        process.result[item] = parseInt(quantity);
      }
    }

    return process;
  }
}

export class ErrorManager {
  static errorVerif(
    cycle: number,
    processName: string,
    stock: Stock,
    stockElement: string,
    errorType: number
  ): void {
    const errorMessages: { [key: number]: string } = {
      0: 'Error: Disordered cycles.',
      1: `Error: Stock ${stockElement} is negative at cycle ${cycle}.`,
      2: `Error: Process ${processName} is not defined.`,
      3: `Error: Process ${processName} does not respect the order of processes.`,
      4: `Error: Process ${processName} has constraints that are not satisfied.`,
      5: `Error: Process ${processName} has a negative cycle ${cycle}.`,
      6: `Error: Process ${processName} triggered without respecting the daily condition at cycle ${cycle}.`,
      7: `Error: Cycles out of order, process ${processName} at cycle ${cycle} started after cycle ${stockElement}.`,
      8: `Error: Process ${processName} triggered without satisfying all conditions at cycle ${cycle}.\nAdditional Info: ${stockElement}`,
      9: 'Error: The trace file is empty.',
      10: `Error: Malformed or empty line in the trace file: ${stockElement}`
    };

    console.log(`\n${errorMessages[errorType]}\n`);
    StockManager.printStock(stock, 'Stock:');
    console.log(`Last cycle: ${cycle}\n`);
    process.exit(1);
  }

  static errorType(error: string): void {
    const errorMessages: { [key: string]: string } = {
      bad_file: 'Bad file',
      bad_processes:
        'No processes in the folder!!!\nMinimum one process is required'
    };
    console.log(`Error: ${errorMessages[error]}`);
    process.exit(1);
  }
}
