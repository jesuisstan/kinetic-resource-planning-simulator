import { Stock, Process, ProcessList } from './types';
import * as fs from 'fs';
import { ConfigValidator } from './validator';

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
      console.log(`     ${key} => ${value}`);
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
    // First, validate the configuration file
    const validation = ConfigValidator.validate(filePath);
    if (!validation.isValid) {
      console.log(ConfigValidator.formatErrors(validation.errors));
      process.exit(1);
    }

    // If validation passes, parse the file normally
    let optimizationTarget = '';
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Stock line: name:quantity
      const stockMatch = trimmedLine.match(/^(\w+):(-?\d+)$/);
      if (stockMatch) {
        const [, name, value] = stockMatch;
        stock[name] = parseInt(value);
        continue;
      }

      // Process line: name:(need1:qty1;need2:qty2):(result1:qty1;result2:qty2):delay
      // Also handles empty results: name:(need1:qty1):():delay
      // And handles missing parentheses: name:(need1:qty1)::delay
      const processMatch = trimmedLine.match(
        /^(\w+):\(([^)]*)\):\(?([^)]*)\)?:(\d+)$/
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

        // Find the first non-time target, or use 'time' if all are time
        for (const target of targets) {
          if (target !== 'time') {
            optimizationTarget = target;
            break;
          }
        }

        // If no non-time target found, use 'time' as default
        if (!optimizationTarget) {
          optimizationTarget = 'time';
        }

        continue;
      }
    }

    if (!optimizationTarget) {
      ErrorManager.errorType('bad_file');
    }

    // If optimization target is 'time', it's valid
    if (optimizationTarget === 'time') {
      return optimizationTarget;
    }

    // Otherwise, check if it exists in stock
    if (!(optimizationTarget in stock)) {
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
      10: `Error: Malformed or empty line in the trace file: ${stockElement}`,
      11: `Error: Process ${processName} cycle ${cycle} is not a number.`,
      12: `Error: ${stockElement}`
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

export class ScenarioAnalyzer {
  /**
   * Determines if a scenario is complex based on process analysis
   */
  static isComplexScenario(processList: ProcessList): boolean {
    // 1. Self-referencing processes that change resource quantities (start_dream_2)
    // 2. At least one very long delay process

    const hasLevelChangingSelfReferencingProcesses =
      this.hasLevelChangingSelfReferencingProcesses(processList);
    const hasVeryLongDelays = this.hasVeryLongDelays(processList);

    return hasLevelChangingSelfReferencingProcesses && hasVeryLongDelays;
  }

  /**
   * Checks for very long delays relative to other processes in the scenario
   * Looks for processes with delays that are significantly longer than the average
   */
  private static hasVeryLongDelays(processList: ProcessList): boolean {
    const processes = Object.values(processList);
    if (processes.length === 0) return false;

    const delays = processes.map((p) => p.delay);
    const avgDelay =
      delays.reduce((sum, delay) => sum + delay, 0) / delays.length;
    const maxDelay = Math.max(...delays);

    // A process is considered "very long" if it's at least 5x the average delay
    // and at least 100 cycles long (to avoid false positives with very fast scenarios)
    return maxDelay >= Math.max(avgDelay * 5, 100);
  }

  /**
   * Checks for processes that consume and produce the same resource with different levels
   */
  private static hasLevelChangingSelfReferencingProcesses(
    processList: ProcessList
  ): boolean {
    return Object.values(processList).some((process) => {
      const needs = Object.keys(process.need);
      const results = Object.keys(process.result);

      // Check if any resource is both consumed and produced
      for (const need of needs) {
        if (results.includes(need)) {
          // Check if the quantities are different (changing the level)
          if (process.need[need] !== process.result[need]) {
            return true;
          }
        }
      }

      return false;
    });
  }
}
