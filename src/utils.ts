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

export class ScenarioAnalyzer {
  /**
   * Determines if a scenario is complex based on process analysis
   */
  static isComplexScenario(processList: ProcessList): boolean {
    // 1. Presence of hierarchical recursion (processes consume and produce the same resource with different levels)
    const hasHierarchicalRecursion = this.hasHierarchicalRecursion(processList);

    // 2. Presence of processes with multiple inputs and outputs (more than 3)
    const hasComplexProcesses = this.hasComplexProcesses(processList);

    // 3. Presence of processes with the same resource names in input and output
    // And this resource must have different levels (not a simple cycle)
    const hasSelfReferencingProcesses =
      this.hasComplexSelfReferencingProcesses(processList);

    // Complex scenario only if there is hierarchical recursion
    // OR combination of complex processes with self-reference
    return (
      hasHierarchicalRecursion ||
      (hasComplexProcesses && hasSelfReferencingProcesses)
    );
  }

  /**
   * Checks for processes with multiple inputs and outputs (more than 3)
   */
  private static hasComplexProcesses(processList: ProcessList): boolean {
    return Object.values(processList).some(
      (process) =>
        Object.keys(process.need).length > 3 ||
        Object.keys(process.result).length > 3
    );
  }

  /**
   * Checks for complex self-referencing processes
   * Excludes simple cycles like A -> B -> A
   */
  private static hasComplexSelfReferencingProcesses(
    processList: ProcessList
  ): boolean {
    const selfReferencingProcesses = Object.values(processList).filter(
      (process) => {
        const needs = Object.keys(process.need);
        const results = Object.keys(process.result);
        return needs.some((need) => results.includes(need));
      }
    );

    if (selfReferencingProcesses.length === 0) return false;

    // Check if there is a resource with different levels
    const resourceLevels = new Map<string, Set<number>>();

    for (const process of selfReferencingProcesses) {
      for (const [resource, quantity] of Object.entries(process.need)) {
        if (resource in process.result) {
          if (!resourceLevels.has(resource)) {
            resourceLevels.set(resource, new Set());
          }
          resourceLevels.get(resource)!.add(quantity);
          resourceLevels.get(resource)!.add(process.result[resource]);
        }
      }
    }

    // Check if there is a resource with different levels (not a simple cycle)
    for (const [resource, levels] of resourceLevels.entries()) {
      if (levels.size > 1) {
        // Check that this is not a simple cycle A -> B -> A
        const sortedLevels = Array.from(levels).sort((a, b) => a - b);

        // If there are at least 3 different levels, this is complex self-reference
        if (sortedLevels.length >= 3) {
          return true;
        }

        // Check that this is not a simple cycle through intermediate resources
        const hasComplexCycle = this.hasComplexCycle(resource, processList);
        if (hasComplexCycle) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Checks if there is a complex cycle for a resource
   * Simple cycle: A -> B -> A
   * Complex cycle: A -> B -> C -> A or A -> B -> C -> D -> A
   */
  private static hasComplexCycle(
    resource: string,
    processList: ProcessList
  ): boolean {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (
      currentResource: string,
      targetResource: string,
      depth: number
    ): boolean => {
      if (depth > 3) return false; // Too deep
      if (currentResource === targetResource && depth > 1) return true; // Cycle found

      visited.add(currentResource);
      path.push(currentResource);

      // Look for processes that consume the current resource
      for (const process of Object.values(processList)) {
        if (currentResource in process.need) {
          // Check all outputs of the process
          for (const outputResource of Object.keys(process.result)) {
            if (!visited.has(outputResource)) {
              if (dfs(outputResource, targetResource, depth + 1)) {
                return true;
              }
            }
          }
        }
      }

      path.pop();
      visited.delete(currentResource);
      return false;
    };

    return dfs(resource, resource, 0);
  }

  /**
   * Checks for hierarchical recursion
   * Finds processes that consume and produce the same resource
   * but with different "levels" or quantities
   */
  private static hasHierarchicalRecursion(processList: ProcessList): boolean {
    const selfReferencingProcesses = Object.values(processList).filter(
      (process) => {
        const needs = Object.keys(process.need);
        const results = Object.keys(process.result);
        return needs.some((need) => results.includes(need));
      }
    );

    if (selfReferencingProcesses.length === 0) return false;

    // Check if there are different "levels" of the same resource
    const resourceLevels = new Map<string, Set<number>>();

    for (const process of selfReferencingProcesses) {
      for (const [resource, quantity] of Object.entries(process.need)) {
        if (resource in process.result) {
          if (!resourceLevels.has(resource)) {
            resourceLevels.set(resource, new Set());
          }
          resourceLevels.get(resource)!.add(quantity);
          resourceLevels.get(resource)!.add(process.result[resource]);
        }
      }
    }

    // Check if there is a resource with different levels AND hierarchical chain
    for (const [resource, levels] of resourceLevels.entries()) {
      if (levels.size > 1) {
        // Check if there is a hierarchical chain for this resource
        const sortedLevels = Array.from(levels).sort((a, b) => a - b);

        // Hierarchical recursion must have at least 3 levels and create a chain
        if (sortedLevels.length >= 3) {
          // Check if there are processes that create a chain of levels
          const hasHierarchicalChain = this.hasHierarchicalChain(
            resource,
            sortedLevels,
            processList
          );
          if (hasHierarchicalChain) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Checks if there are processes that create a hierarchical chain
   * For example: dream:1 -> dream:2 -> dream:3
   */
  private static hasHierarchicalChain(
    resource: string,
    levels: number[],
    processList: ProcessList
  ): boolean {
    const processesForResource = Object.values(processList).filter(
      (process) => resource in process.need && resource in process.result
    );

    if (processesForResource.length < 2) return false;

    // Check if there are processes that consume one level and produce the next
    for (let i = 0; i < levels.length - 1; i++) {
      const currentLevel = levels[i];
      const nextLevel = levels[i + 1];

      const hasProcessForLevel = processesForResource.some(
        (process) =>
          process.need[resource] === currentLevel &&
          process.result[resource] === nextLevel
      );

      if (!hasProcessForLevel) return false;
    }

    return true;
  }
}
