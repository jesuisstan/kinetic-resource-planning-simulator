import * as yargs from 'yargs';
import * as fs from 'fs';
import { StockManager, ProcessInitializer, ErrorManager } from './utils';
import { Stock, ProcessList } from './types';

class Verification {
  private file: string;
  private trace: string;
  private stock: Stock = {};
  private initialStock: Stock = {};
  private processList: ProcessList = {};
  private optimizationTarget = '';
  private cycle = 0;
  private maxDelay = 0;
  private executedProcesses = new Set<string>();

  constructor(file: string, trace: string) {
    this.file = file;
    this.trace = trace;
  }

  public execute(): void {
    const traceContent = fs.readFileSync(this.trace, 'utf-8');
    const traceLines = traceContent.split('\n').filter((line) => line.trim());

    if (traceLines.length === 0) {
      ErrorManager.errorVerif(this.cycle, '', this.stock, '', 9);
    }

    this.optimizationTarget = ProcessInitializer.readProcessFile(
      this.file,
      this.stock,
      this.processList
    );
    this.initialStock = { ...this.stock };
    this.readTrace(traceLines);
  }

  private readTrace(traceLines: string[]): void {
    let previousCycle = 0;
    const cycleSet = new Set<number>();

    for (const line of traceLines) {
      if (!line.trim() || !line.includes(':')) {
        ErrorManager.errorVerif(this.cycle, '', this.stock, line.trim(), 10);
      }

      const [cycleStr, processName] = line.trim().split(':');
      this.cycle = parseInt(cycleStr);

      if (
        !(processName in this.processList) &&
        processName !== 'no_more_process_doable'
      ) {
        ErrorManager.errorVerif(this.cycle, processName, this.stock, '', 2);
      }

      if (this.cycle < 0) {
        ErrorManager.errorVerif(this.cycle, processName, this.stock, '', 5);
      }

      if (this.cycle < previousCycle) {
        ErrorManager.errorVerif(
          this.cycle,
          processName,
          this.stock,
          previousCycle.toString(),
          7
        );
      }

      if (
        processName !== 'no_more_process_doable' &&
        this.executedProcesses.size > 0
      ) {
        const process = this.processList[processName];
        const previousProcessName = Array.from(this.executedProcesses).pop()!;
        const previousProcess = this.processList[previousProcessName];

        const missingDependencies = Object.entries(process.need).filter(
          ([dependency, quantity]) => (this.stock[dependency] || 0) < quantity
        );

        if (missingDependencies.length > 0) {
          const additionalInfo = `\nDependencies not satisfied for process ${processName}. Needed: ${JSON.stringify(
            process.need
          )}, Available: ${JSON.stringify(previousProcess.result)}`;
          ErrorManager.errorVerif(
            this.cycle,
            processName,
            this.stock,
            additionalInfo,
            8
          );
        }

        if (
          !Object.keys(process.need).some(
            (dependency) => dependency in previousProcess.result
          )
        ) {
          // No dependency check needed
        } else {
          if (process.delay > 0) {
            const delayCycle = this.cycle - previousProcess.startCycle!;
            if (this.cycle - previousCycle !== this.maxDelay) {
              ErrorManager.errorVerif(
                this.cycle,
                processName,
                this.stock,
                '',
                6
              );
            }
          }
        }
      } else {
        this.maxDelay = Math.max(this.maxDelay, 1);
      }

      if (previousCycle !== 0 && this.cycle !== previousCycle) {
        this.maxDelay = 0;
      }

      if (processName !== 'no_more_process_doable') {
        const process = this.processList[processName];

        StockManager.update(this.stock, process.need, '-');
        StockManager.update(this.stock, process.result, '+');

        this.processList[processName].startCycle = this.cycle;
        this.maxDelay = Math.max(
          this.maxDelay,
          this.processList[processName].delay
        );
        this.executedProcesses.add(processName);
      } else {
        break;
      }

      previousCycle = this.cycle;
      cycleSet.add(this.cycle);
    }
  }

  public displayResult(): void {
    console.log('\n✅ VERIFICATION COMPLETE!');
    console.log('============================================================');
    console.log('🎉 All processes executed successfully!');
    console.log(`⏰ Total cycles: ${this.cycle}`);
    console.log('');

    console.log('📦 RESOURCE SUMMARY:');
    console.log('============================================================');
    StockManager.printStock(this.initialStock, '🔵 Initial resources:');
    StockManager.printStock(this.stock, '🟢 Final resources:');
    console.log('============================================================');
  }
}

function main(): void {
  const argv = yargs
    .usage('Usage: krpsim_verif <file> <trace.log>')
    .demandCommand(2)
    .help()
    .parseSync();

  const file = argv._[0] as string;
  const trace = argv._[1] as string;

  if (!file || !trace) {
    console.error('Usage: krpsim_verif <file> <trace>');
    process.exit(1);
  }

  const verifier = new Verification(file, trace);
  verifier.execute();
  verifier.displayResult();
}

if (require.main === module) {
  main();
}
