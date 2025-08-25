import * as yargs from 'yargs';
import * as fs from 'fs';
import { StockManager, ProcessInitializer, ErrorManager } from './utils';
import { Stock, ProcessList } from './types';

class Verification {
  private file: string; // Configuration file path
  private trace: string; // Trace log file path
  private stock: Stock = {}; // Current resource state
  private initialStock: Stock = {}; // Initial resource state (for display)
  private processList: ProcessList = {}; // Available processes from config
  private optimizationTarget = ''; // Target resource to optimize
  private cycle = 0; // Current simulation cycle
  private maxDelay = 0; // Maximum process delay
  private executedProcesses = new Set<string>(); // Track executed processes
  private runningProcesses = new Map<
    string,
    { startCycle: number; endCycle: number; processName: string }
  >(); // Track running processes
  private lastCycleInTrace = 0; // Last cycle found in trace file
  private allResources = new Set<string>(); // All resources mentioned in config

  constructor(file: string, trace: string) {
    this.file = file;
    this.trace = trace;
  }

  public execute(): void {
    // Read and parse trace file
    const traceContent = fs.readFileSync(this.trace, 'utf-8');
    const traceLines = traceContent.split('\n').filter((line) => line.trim());

    // Check if trace file is empty
    if (traceLines.length === 0) {
      ErrorManager.errorVerif(this.cycle, '', this.stock, '', 9);
    }

    // Load configuration file and initialize processes
    this.optimizationTarget = ProcessInitializer.readProcessFile(
      this.file,
      this.stock,
      this.processList
    );
    this.initialStock = { ...this.stock }; // Save initial state for display

    // Collect all resources mentioned in processes
    this.collectAllResources();

    this.readTrace(traceLines);
  }

  private readTrace(traceLines: string[]): void {
    let previousCycle = 0;
    const cycleSet = new Set<number>();
    let hasNoMoreProcessDoable = false;

    // Process each line in the trace file
    for (const line of traceLines) {
      // Validate line format (must contain ':')
      if (!line.trim() || !line.includes(':')) {
        ErrorManager.errorVerif(this.cycle, '', this.stock, line.trim(), 10);
      }

      // Parse cycle number and process name
      const [cycleStr, processName] = line.trim().split(':');
      this.cycle = parseInt(cycleStr);
      this.lastCycleInTrace = Math.max(this.lastCycleInTrace, this.cycle);

      if (isNaN(this.cycle)) {
        ErrorManager.errorVerif(this.cycle, processName, this.stock, '', 11);
      }

      // Check if process is defined in configuration
      if (
        !(processName in this.processList) &&
        processName !== 'no_more_process_doable'
      ) {
        ErrorManager.errorVerif(this.cycle, processName, this.stock, '', 2);
      }

      // Check for negative cycle numbers
      if (this.cycle < 0) {
        ErrorManager.errorVerif(this.cycle, processName, this.stock, '', 5);
      }

      // Check for out-of-order cycles
      if (this.cycle < previousCycle) {
        ErrorManager.errorVerif(
          this.cycle,
          processName,
          this.stock,
          previousCycle.toString(),
          7
        );
      }

      // Complete processes that finished before this cycle
      this.completeFinishedProcesses(this.cycle);

      // Resource availability check (only for actual processes)
      if (processName !== 'no_more_process_doable') {
        const process = this.processList[processName];

        // Check if all required resources are available in current stock
        const missingDependencies = Object.entries(process.need).filter(
          ([dependency, quantity]) => (this.stock[dependency] || 0) < quantity
        );

        // If any dependencies are missing, report error
        if (missingDependencies.length > 0) {
          const additionalInfo = `\nDependencies not satisfied for process ${processName}.\nNeeded: ${JSON.stringify(
            process.need
          )},\nAvailable: ${JSON.stringify(this.stock)}`;
          ErrorManager.errorVerif(
            this.cycle,
            processName,
            this.stock,
            additionalInfo,
            8
          );
        }
      }

      // Reset max delay when moving to a new cycle
      if (previousCycle !== 0 && this.cycle !== previousCycle) {
        this.maxDelay = 0;
      }

      // Update resource state (only for actual processes)
      if (processName !== 'no_more_process_doable') {
        const process = this.processList[processName];

        // Consume required resources immediately when process starts
        StockManager.update(this.stock, process.need, '-'); // Subtract consumed resources

        // Track process execution - add to running processes
        const endCycle = this.cycle + process.delay;
        const processKey = `${processName}_${this.cycle}_${this.runningProcesses.size}`; // Unique key for each process instance
        this.runningProcesses.set(processKey, {
          startCycle: this.cycle,
          endCycle,
          processName
        }); // Store process name in the info
        this.maxDelay = Math.max(this.maxDelay, process.delay);
        this.executedProcesses.add(processName);
      } else {
        // End of simulation marker found
        hasNoMoreProcessDoable = true;
        break;
      }

      // Update tracking variables for next iteration
      previousCycle = this.cycle;
      cycleSet.add(this.cycle);
    }

    // Complete processes that finished within the simulation time
    this.completeFinishedProcesses(this.lastCycleInTrace);

    // Check if simulation ended properly with no_more_process_doable marker
    if (!hasNoMoreProcessDoable) {
      ErrorManager.errorVerif(
        this.lastCycleInTrace,
        '',
        this.stock,
        'Missing no_more_process_doable marker at end of simulation',
        12
      );
    }
  }

  private completeFinishedProcesses(currentCycle: number): void {
    for (const [processKey, processInfo] of this.runningProcesses.entries()) {
      const processName = processInfo.processName; // Use stored process name
      if (!this.processList[processName]) {
        continue;
      }
      if (processInfo.endCycle <= currentCycle) {
        // Process finished, add its results
        const process = this.processList[processName];
        StockManager.update(this.stock, process.result, '+'); // Add produced resources
        this.runningProcesses.delete(processKey);
      }
    }
  }

  private collectAllResources(): void {
    // Add all resources from initial stock
    for (const resource of Object.keys(this.initialStock)) {
      this.allResources.add(resource);
    }

    // Add all resources mentioned in processes
    for (const process of Object.values(this.processList)) {
      for (const resource of Object.keys(process.need)) {
        this.allResources.add(resource);
      }
      for (const resource of Object.keys(process.result)) {
        this.allResources.add(resource);
      }
    }
  }

  private printStockComplete(stock: Stock, msg: string): void {
    console.log(msg);
    // Sort resources alphabetically for consistent output
    const sortedResources = Array.from(this.allResources).sort();

    for (const resource of sortedResources) {
      const value = stock[resource] || 0;
      console.log(`     ${resource} => ${value}`);
    }
    console.log('');
  }

  public displayResult(): void {
    // Display successful verification results
    console.log('✅ VERIFICATION COMPLETE!');
    console.log('============================================================');
    console.log('🎉 All processes executed successfully!');
    console.log(`⏰ Total cycles: ${this.lastCycleInTrace}`);
    console.log('');

    // Show resource summary (initial vs final state)
    console.log('📦 RESOURCE SUMMARY:');
    console.log('============================================================');
    this.printStockComplete(this.initialStock, '🔵 Initial resources:');
    this.printStockComplete(this.stock, '🟢 Final resources:');
    console.log('============================================================');
  }
}

function main(): void {
  // Parse command line arguments
  const argv = yargs
    .usage('Usage: krpsim_verif <file> <trace.log>')
    .demandCommand(2)
    .help()
    .parseSync();

  const file = argv._[0] as string; // Configuration file
  const trace = argv._[1] as string; // Trace log file

  // Validate required arguments
  if (!file || !trace) {
    console.error('Usage: krpsim_verif <config-file> <trace-file>');
    process.exit(1);
  }

  // Create verifier instance and run verification
  const verifier = new Verification(file, trace);
  verifier.execute();
  verifier.displayResult();
}

if (require.main === module) {
  main();
}
