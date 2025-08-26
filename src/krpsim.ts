import * as yargs from 'yargs';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs';
import * as path from 'path';
import { MainWalk } from './MainWalk';
import { StockManager, ProcessInitializer, ErrorManager } from './utils';
import { Stock, ProcessList } from './types';

/**
 * Simulation - Main orchestrator class for the KRPSIM system
 * Manages the entire simulation lifecycle: parsing, optimization, execution, and output
 */
class Simulation {
  private stock: Stock = {}; // Initial resource stock from config file
  private processList: ProcessList = {}; // All available processes from config file
  private optimizationTarget = ''; // Target resource to optimize (e.g., 'euro', 'time')
  private goodInstructions: any[] = []; // Final execution plan from MainWalk
  private startTime: number; // Simulation start timestamp
  private fileName = ''; // Configuration file name (without path)

  // Time and resource limits for the simulation
  private maxCycle = 10000; // Maximum simulation cycles (time units)
  private maxDelay = 0; // User-specified time limit (from command line)
  private maxInstructions = 10000; // Maximum process executions allowed in planning phase
  private maxGenerations = 1000; // Maximum optimization attempts (genetic algorithm iterations)

  constructor(startTime: number) {
    this.startTime = startTime;
  }

  /**
   * Parse command line arguments and configuration file
   * Sets up all simulation parameters and limits
   */
  private argumentParser(): void {
    const argv = yargs
      .option('c', {
        alias: 'cycle',
        type: 'number',
        default: 10000,
        describe: 'max number of cycle'
      })
      .option('g', {
        alias: 'generations',
        type: 'number',
        default: 1000,
        describe: 'max number of generations'
      })
      .option('i', {
        alias: 'instructions',
        type: 'number',
        default: 10000,
        describe: 'max number of instructions allowed during process generation'
      })
      .help()
      .parseSync();

    const file = argv._[0] as string;
    const delay = argv._[1] as number;

    if (!file || typeof delay !== 'number') {
      console.error('Usage: krpsim <file> <delay>');
      process.exit(1);
    }

    if (delay < 0) {
      console.error('🔴 Error: Delay cannot be negative.');
      process.exit(1);
    }

    this.fileName = path.basename(file);
    this.maxCycle = argv.c; // Internal cycle limit (safety)
    this.maxDelay = delay; // User time limit (main constraint)
    this.maxInstructions = argv.i; // Planning phase limit
    this.maxGenerations = argv.g; // Optimization iterations limit

    if (this.maxGenerations < 1) {
      ErrorManager.errorType('bad_processes');
    }

    // Parse configuration file and get optimization target
    this.optimizationTarget = ProcessInitializer.readProcessFile(
      file,
      this.stock,
      this.processList
    );
  }

  /**
   * Execute the optimization algorithm multiple times to find the best solution
   * Uses a genetic algorithm approach: try multiple MainWalk instances and keep the best
   *
   * KEY DIFFERENCES EXPLAINED:
   * - maxGenerations: How many optimization attempts to make (genetic algorithm iterations)
   * - maxInstructions: How many process executions allowed during planning phase
   * - maxCycle: Maximum simulation time units (safety limit)
   * - maxDelay: User-specified time limit (main constraint)
   */
  private execute(): MainWalk {
    const progressBar = new cliProgress.SingleBar({
      format: 'Creating plan |{bar}| {percentage}%',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(this.maxGenerations, 0);
    progressBar.increment();

    // Create first MainWalk instance (baseline solution)
    let mainWalkInstance = new MainWalk(
      this.stock,
      this.optimizationTarget,
      this.processList,
      this.maxCycle,
      this.maxInstructions,
      this.maxDelay,
      this.fileName
    );

    // Try multiple optimization attempts (genetic algorithm approach)
    for (let i = 0; i < this.maxGenerations - 1; i++) {
      const deltaTime = Date.now() - this.startTime;
      if (deltaTime > this.maxDelay * 1000) {
        // Convert to milliseconds - stop if we exceed user time limit
        break;
      }
      progressBar.increment();

      // Create new MainWalk instance (different random choices lead to different solutions)
      const newMainWalk = new MainWalk(
        this.stock,
        this.optimizationTarget,
        this.processList,
        this.maxCycle,
        this.maxInstructions,
        this.maxDelay,
        this.fileName
      );

      // Keep the best solution based on multiple criteria
      if (newMainWalk.loop > mainWalkInstance.loop) {
        // Prefer solutions that can continue running (self-sustaining)
        mainWalkInstance = newMainWalk;
      } else if (
        newMainWalk.loop === mainWalkInstance.loop &&
        newMainWalk.score >= mainWalkInstance.score
      ) {
        if (
          newMainWalk.score === mainWalkInstance.score &&
          newMainWalk.created <= mainWalkInstance.created
        ) {
          // Keep current instance (same score, less resource usage)
        } else {
          // Better score or same score with more resource production
          mainWalkInstance = newMainWalk;
        }
      }
    }

    progressBar.stop();
    console.log('============================================================');
    return mainWalkInstance;
  }

  /**
   * Display parsed configuration information
   * Shows initial resources, processes, and optimization target
   */
  private displayParsing(): void {
    StockManager.displayParsing({
      fileName: this.fileName,
      maxDelay: this.maxDelay,
      optimizationTarget: this.optimizationTarget,
      stock: this.stock,
      processList: this.processList
    });
  }

  /**
   * Execute the final optimized plan and generate output
   * Creates the execution log and displays final results
   */
  private displayResult(mainWalkInstance: MainWalk): void {
    let result = '';
    const diffStock = this.stockDifference(mainWalkInstance);
    let i = 0;

    // Execute the plan multiple times if it's self-sustaining
    // This allows the system to run for the full user-specified time limit
    while (
      mainWalkInstance.goodInstructions[0].processes.length &&
      mainWalkInstance.goodInstructions[
        mainWalkInstance.goodInstructions.length - 1
      ].cycle *
        (i + 1) <=
        this.maxDelay &&
      this.updateStock(diffStock)
    ) {
      // Add all process executions to the result log
      for (const cycle of mainWalkInstance.goodInstructions) {
        for (const element of cycle.processes) {
          result += `${
            cycle.cycle +
            mainWalkInstance.goodInstructions[
              mainWalkInstance.goodInstructions.length - 1
            ].cycle *
              i
          }:${element}\n`;
        }
      }
      i++;

      // Check if we've exceeded the user time limit
      const deltaTime = Date.now() - this.startTime;
      if (deltaTime > this.maxDelay * 1000) {
        break;
      }
    }

    const endTime = Date.now() - this.startTime;

    // Display execution progress
    mainWalkInstance.displayProcess();
    console.log(
      `⏹️  Simulation stopped at cycle ${
        mainWalkInstance.goodInstructions[
          mainWalkInstance.goodInstructions.length - 1
        ].cycle *
          i +
        1
      }`
    );
    console.log('============================================================');

    // Display final resource state
    StockManager.printStockComplete(this.stock, '📦 Final resources:');
    console.log(`⏱️  Execution time: ${endTime / 1000}s`);
    console.log('============================================================');

    // Write execution log to file
    const csvPath = `resources/${this.fileName}.log`;
    result += `${
      mainWalkInstance.goodInstructions[
        mainWalkInstance.goodInstructions.length - 1
      ].cycle *
        i +
      1
    }:no_more_process_doable\n`;
    fs.writeFileSync(csvPath, result, 'utf-8');
  }

  /**
   * Calculate the difference between initial and final resource states
   * Used to determine how much each resource changed during execution
   */
  private stockDifference(mainWalkInstance: MainWalk): Stock {
    const diffStock: Stock = {};
    for (const [key, value] of Object.entries(this.stock)) {
      const diff = (mainWalkInstance as any).updatedStock[key] - value;
      if (diff) {
        diffStock[key] = diff;
      }
    }
    return diffStock;
  }

  /**
   * Update the current stock with the difference from execution
   * Returns false if any resource would go negative (invalid state)
   */
  private updateStock(diffStock: Stock): boolean {
    for (const [key, value] of Object.entries(diffStock)) {
      const currentStock = this.stock[key] || 0;
      if (currentStock + value < 0) {
        return false; // Would result in negative resources
      }
      this.stock[key] = currentStock + value;
    }
    return true;
  }

  /**
   * Main simulation runner
   * Orchestrates the entire simulation lifecycle
   */
  public run(): void {
    this.argumentParser(); // Step 1: Parse arguments and config
    this.displayParsing(); // Step 2: Show configuration info
    const mainWalkInstance = this.execute(); // Step 3: Run optimization algorithm
    this.displayResult(mainWalkInstance); // Step 4: Execute plan and show results
    process.exit(0);
  }
}

/**
 * Main entry point
 * Creates and runs the simulation
 */
function main(): void {
  const simulation = new Simulation(Date.now());
  simulation.run();
}

if (require.main === module) {
  main();
}
