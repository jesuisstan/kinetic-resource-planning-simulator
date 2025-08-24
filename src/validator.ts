import { Stock, Process, ProcessList } from './types';
import * as fs from 'fs';

export interface ValidationError {
  type: string;
  message: string;
  line?: number;
  details?: string;
}

export class ConfigValidator {
  private stock: Stock = {};
  private processList: ProcessList = {};
  private optimizationTargets: string[] = [];
  private errors: ValidationError[] = [];
  private lineNumber = 0;

  /**
   * Validates a krpsim configuration file
   */
  static validate(filePath: string): {
    isValid: boolean;
    errors: ValidationError[];
  } {
    const validator = new ConfigValidator();
    return validator.validateFile(filePath);
  }

  private validateFile(filePath: string): {
    isValid: boolean;
    errors: ValidationError[];
  } {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');

      for (let i = 0; i < lines.length; i++) {
        this.lineNumber = i + 1;
        const line = lines[i].trim();

        if (!line || line.startsWith('#')) {
          continue;
        }

        this.validateLine(line);
      }

      // Post-validation checks
      this.validateOverallStructure();
      this.validateUnknownResources();

      return {
        isValid: this.errors.length === 0,
        errors: this.errors
      };
    } catch (error) {
      this.errors.push({
        type: 'file_error',
        message: `Failed to read file: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      });
      return {
        isValid: false,
        errors: this.errors
      };
    }
  }

  private validateLine(line: string): void {
    // Stock line: name:quantity
    const stockMatch = line.match(/^(\w+):(-?\d+)$/);
    if (stockMatch) {
      this.validateStockLine(stockMatch[1], parseInt(stockMatch[2]));
      return;
    }

    // Process line: name:(need1:qty1;need2:qty2):(result1:qty1;result2:qty2):delay
    // Also handles empty results: name:(need1:qty1):():delay
    // And handles missing parentheses: name:(need1:qty1)::delay
    const processMatch = line.match(/^(\w+):\(([^)]*)\):\(?([^)]*)\)?:(\d+)$/);
    if (processMatch) {
      this.validateProcessLine(
        processMatch[1],
        processMatch[2],
        processMatch[3],
        parseInt(processMatch[4])
      );
      return;
    }

    // Optimize line: optimize:(target1;target2)
    const optimizeMatch = line.match(/^optimize:\(([^)]*)\)$/);
    if (optimizeMatch) {
      this.validateOptimizeLine(optimizeMatch[1]);
      return;
    }

    // Unknown line format
    this.errors.push({
      type: 'invalid_format',
      message: `Invalid line format`,
      line: this.lineNumber,
      details: `Line: "${line}"`
    });
  }

  private validateStockLine(name: string, quantity: number): void {
    // Check for duplicate stock
    if (name in this.stock) {
      this.errors.push({
        type: 'duplicate_stock',
        message: `Duplicate stock definition: ${name}`,
        line: this.lineNumber,
        details: `Stock ${name} is defined multiple times`
      });
      return;
    }

    // Check for negative quantity
    if (quantity < 0) {
      this.errors.push({
        type: 'negative_stock',
        message: `Negative stock quantity: ${name}:${quantity}`,
        line: this.lineNumber,
        details: `Stock quantities must be non-negative`
      });
      return;
    }

    this.stock[name] = quantity;
  }

  private validateProcessLine(
    name: string,
    needsStr: string,
    resultsStr: string,
    delay: number
  ): void {
    // Check for duplicate process
    if (name in this.processList) {
      this.errors.push({
        type: 'duplicate_process',
        message: `Duplicate process definition: ${name}`,
        line: this.lineNumber,
        details: `Process ${name} is defined multiple times`
      });
      return;
    }

    // Validate delay
    if (delay <= 0) {
      this.errors.push({
        type: 'invalid_delay',
        message: `Invalid process delay: ${delay}`,
        line: this.lineNumber,
        details: `Process delay must be positive`
      });
      return;
    }

    // Parse and validate needs
    const needs = this.parseResourceList(needsStr, 'needs');
    if (needs === null) return;

    // Parse and validate results
    const results = this.parseResourceList(resultsStr, 'results');
    if (results === null) return;

    // Add process to list first, so we can track created resources
    this.processList[name] = {
      name,
      need: needs,
      result: results,
      delay
    };

    // Initialize stock for resources created by this process
    for (const [resource, quantity] of Object.entries(results)) {
      if (!(resource in this.stock)) {
        this.stock[resource] = 0;
      }
    }
  }

  private validateOptimizeLine(targetsStr: string): void {
    if (!targetsStr.trim()) {
      this.errors.push({
        type: 'empty_optimize',
        message: 'Empty optimize targets',
        line: this.lineNumber,
        details: 'At least one optimization target must be specified'
      });
      return;
    }

    const targets = targetsStr
      .split(';')
      .map((t) => t.trim())
      .filter((t) => t);

    for (const target of targets) {
      if (target === 'time') {
        this.optimizationTargets.push(target);
        continue;
      }

      // Check if target exists in stock
      if (!(target in this.stock)) {
        this.errors.push({
          type: 'unknown_optimize',
          message: `Unknown optimization target: ${target}`,
          line: this.lineNumber,
          details: `Target ${target} is not defined in stock`
        });
        continue;
      }

      this.optimizationTargets.push(target);
    }
  }

  private parseResourceList(
    resourceStr: string,
    context: string
  ): Stock | null {
    const resources: Stock = {};

    if (!resourceStr.trim()) {
      return resources;
    }

    const items = resourceStr.split(';');
    for (const item of items) {
      const trimmedItem = item.trim();
      if (!trimmedItem) continue;

      const [resource, quantityStr] = trimmedItem.split(':');

      if (!resource || !quantityStr) {
        this.errors.push({
          type: 'invalid_resource_format',
          message: `Invalid ${context} format: ${trimmedItem}`,
          line: this.lineNumber,
          details: `Expected format: resource:quantity`
        });
        return null;
      }

      const quantity = parseInt(quantityStr);
      if (isNaN(quantity) || quantity <= 0) {
        this.errors.push({
          type: 'invalid_quantity',
          message: `Invalid quantity in ${context}: ${quantityStr}`,
          line: this.lineNumber,
          details: `Quantity must be a positive integer`
        });
        return null;
      }

      resources[resource] = quantity;
    }

    return resources;
  }

  private validateOverallStructure(): void {
    // Check if there are any stocks defined
    if (Object.keys(this.stock).length === 0) {
      this.errors.push({
        type: 'no_stocks',
        message: 'No stocks defined',
        details: 'At least one stock must be defined'
      });
    }

    // Check if there are any processes defined
    if (Object.keys(this.processList).length === 0) {
      this.errors.push({
        type: 'no_processes',
        message: 'No processes defined',
        details: 'At least one process must be defined'
      });
    }

    // Check if optimize directive is present
    if (this.optimizationTargets.length === 0) {
      this.errors.push({
        type: 'no_optimize',
        message: 'No optimize directive found',
        details: 'An optimize directive must be specified'
      });
    }
  }

  private validateUnknownResources(): void {
    // Check for unknown resources in process needs
    for (const [processName, process] of Object.entries(this.processList)) {
      for (const resource of Object.keys(process.need)) {
        if (!(resource in this.stock)) {
          this.errors.push({
            type: 'unknown_need',
            message: `Unknown resource in process needs: ${resource}`,
            details: `Process ${processName} requires ${resource} which is not defined in stock or created by any process`
          });
        }
      }
    }
  }

  /**
   * Formats validation errors for display
   */
  static formatErrors(errors: ValidationError[]): string {
    if (errors.length === 0) {
      return '✅ Configuration is valid';
    }

    let result = '❌ Configuration validation failed:\n\n';

    for (const error of errors) {
      result += `🔴 ${error.type.toUpperCase()}\n`;
      result += `   ${error.message}\n`;
      if (error.line) {
        result += `   Line: ${error.line}\n`;
      }
      if (error.details) {
        result += `   Details: ${error.details}\n`;
      }
      result += '\n';
    }

    return result;
  }
}
