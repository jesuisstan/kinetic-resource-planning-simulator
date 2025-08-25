import * as yargs from 'yargs';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs';
import * as path from 'path';
import { MainWalk } from './MainWalk';
import { StockManager, ProcessInitializer, ErrorManager } from './utils';
import { Stock, ProcessList } from './types';

class Simulation {
  private stock: Stock = {};
  private processList: ProcessList = {};
  private optimizationTarget = '';
  private goodInstructions: any[] = [];
  private startTime: number;
  private fileName = '';
  private maxCycle = 10000;
  private maxDelay = 0;
  private maxInstructions = 10000;
  private maxGenerations = 1000;

  constructor(startTime: number) {
    this.startTime = startTime;
  }

  private argumentParser(): void {
    const argv = yargs
      .option('c', {
        alias: 'cycle',
        type: 'number',
        default: 10000,
        describe: 'max number of cycle'
      })
      .option('p', {
        alias: 'process',
        type: 'number',
        default: 1000,
        describe: 'max number of process'
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

    this.fileName = path.basename(file);
    this.maxCycle = argv.c;
    this.maxDelay = delay;
    this.maxInstructions = argv.i;
    this.maxGenerations = argv.p;

    if (this.maxGenerations < 1) {
      ErrorManager.errorType('bad_processes');
    }

    this.optimizationTarget = ProcessInitializer.readProcessFile(
      file,
      this.stock,
      this.processList
    );
  }

  private execute(): MainWalk {
    const progressBar = new cliProgress.SingleBar({
      format: 'Creating plan |{bar}| {percentage}%',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(this.maxGenerations, 0);
    progressBar.increment();

    let mainWalkInstance = new MainWalk(
      this.stock,
      this.optimizationTarget,
      this.processList,
      this.maxCycle,
      this.maxInstructions,
      this.maxDelay,
      this.fileName
    );

    for (let i = 0; i < this.maxGenerations - 1; i++) {
      const deltaTime = Date.now() - this.startTime;
      if (deltaTime > this.maxDelay * 1000) {
        // Convert to milliseconds
        break;
      }
      progressBar.increment();

      const newMainWalk = new MainWalk(
        this.stock,
        this.optimizationTarget,
        this.processList,
        this.maxCycle,
        this.maxInstructions,
        this.maxDelay,
        this.fileName
      );

      if (newMainWalk.loop > mainWalkInstance.loop) {
        mainWalkInstance = newMainWalk;
      } else if (
        newMainWalk.loop === mainWalkInstance.loop &&
        newMainWalk.score >= mainWalkInstance.score
      ) {
        if (
          newMainWalk.score === mainWalkInstance.score &&
          newMainWalk.created <= mainWalkInstance.created
        ) {
          // Keep current instance
        } else {
          mainWalkInstance = newMainWalk;
        }
      }
    }

    progressBar.stop();
    console.log('============================================================');
    return mainWalkInstance;
  }

  private displayParsing(): void {
    StockManager.displayParsing({
      fileName: this.fileName,
      maxDelay: this.maxDelay,
      optimizationTarget: this.optimizationTarget,
      stock: this.stock,
      processList: this.processList
    });
  }

  private displayResult(mainWalkInstance: MainWalk): void {
    let result = '';
    const diffStock = this.stockDifference(mainWalkInstance);
    let i = 0;

    while (
      mainWalkInstance.goodInstructions[0].processes.length &&
      mainWalkInstance.goodInstructions[
        mainWalkInstance.goodInstructions.length - 1
      ].cycle *
        (i + 1) <=
        this.maxDelay &&
      this.updateStock(diffStock)
    ) {
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

      const deltaTime = Date.now() - this.startTime;
      if (deltaTime > this.maxDelay * 1000) {
        break;
      }
    }

    const endTime = Date.now() - this.startTime;

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

    StockManager.printStockComplete(this.stock, '📦 Final resources:');
    console.log(`⏱️  Execution time: ${endTime / 1000}s`);
    console.log('============================================================');

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

  private updateStock(diffStock: Stock): boolean {
    for (const [key, value] of Object.entries(diffStock)) {
      const currentStock = this.stock[key] || 0;
      if (currentStock + value < 0) {
        return false;
      }
      this.stock[key] = currentStock + value;
    }
    return true;
  }

  public run(): void {
    this.argumentParser();
    this.displayParsing();
    const mainWalkInstance = this.execute();
    this.displayResult(mainWalkInstance);
    process.exit(0);
  }
}

function main(): void {
  const simulation = new Simulation(Date.now());
  simulation.run();
}

if (require.main === module) {
  main();
}
