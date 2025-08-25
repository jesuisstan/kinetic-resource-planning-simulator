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
    this.readTrace(traceLines);
  }

  private readTrace(traceLines: string[]): void {
    let previousCycle = 0;
    const cycleSet = new Set<number>();

    // Process each line in the trace file
    for (const line of traceLines) {
      // Validate line format (must contain ':')
      if (!line.trim() || !line.includes(':')) {
        ErrorManager.errorVerif(this.cycle, '', this.stock, line.trim(), 10);
      }

      // Parse cycle number and process name
      const [cycleStr, processName] = line.trim().split(':');
      this.cycle = parseInt(cycleStr);

      if (isNaN(this.cycle)) {
        ErrorManager.errorVerif(this.cycle, '', this.stock, '', 11);
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

        // Consume required resources and produce results
        StockManager.update(this.stock, process.need, '-'); // Subtract consumed resources
        StockManager.update(this.stock, process.result, '+'); // Add produced resources

        // Track process execution
        this.processList[processName].startCycle = this.cycle;
        this.maxDelay = Math.max(
          this.maxDelay,
          this.processList[processName].delay
        );
        this.executedProcesses.add(processName);
      } else {
        // End of simulation marker found
        break;
      }

      // Update tracking variables for next iteration
      previousCycle = this.cycle;
      cycleSet.add(this.cycle);
    }
  }

  public displayResult(): void {
    // Display successful verification results
    console.log('✅ VERIFICATION COMPLETE!');
    console.log('============================================================');
    console.log('🎉 All processes executed successfully!');
    console.log(`⏰ Total cycles: ${this.cycle}`);
    console.log('');

    // Show resource summary (initial vs final state)
    console.log('📦 RESOURCE SUMMARY:');
    console.log('============================================================');
    StockManager.printStock(this.initialStock, '🔵 Initial resources:');
    StockManager.printStock(this.stock, '🟢 Final resources:');
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
