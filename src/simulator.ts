import { Stock, Process, OptimizeGoal, ConfigData } from './parser';

export interface SimulationResult {
  finalStocks: { [key: string]: number };
  processOrder: Array<[string, number]>; // [processName, startTime]
  isFinite: boolean;
  totalTime: number;
}

export class Simulator {
  private currentStocks: { [key: string]: number };
  private processes: { [key: string]: Process };
  private optimize: OptimizeGoal;
  private delay: number;
  private inventory: Array<[string, number]> = []; // [processName, startTime]
  private targetProcess: Process | null = null;

  constructor(config: ConfigData, delay: number) {
    // Convert stocks array to dictionary for easier access
    this.currentStocks = {};
    for (const stock of config.stocks) {
      this.currentStocks[stock.name] = stock.quantity;
    }

    this.processes = config.processes.reduce((acc, proc) => {
      acc[proc.name] = proc;
      return acc;
    }, {} as { [key: string]: Process });

    this.optimize = config.optimize;
    this.delay = delay;

    // Find the process that produces our optimization target
    if (this.optimize.stocks.length > 0) {
      for (const proc of Object.values(this.processes)) {
        for (const result of proc.results) {
          if (this.optimize.stocks.includes(result.name)) {
            this.targetProcess = proc;
            break;
          }
        }
        if (this.targetProcess) break;
      }
    }
  }

  private isProcessAvailable(process: Process): boolean {
    for (const need of process.needs) {
      if ((this.currentStocks[need.name] || 0) < need.quantity) {
        return false;
      }
    }
    return true;
  }

  private getAvailableProcesses(): string[] {
    return Object.values(this.processes)
      .filter((proc) => this.isProcessAvailable(proc))
      .map((proc) => proc.name);
  }

  private applyProcess(processName: string, time: number): void {
    const process = this.processes[processName];

    // Consume resources
    for (const need of process.needs) {
      this.currentStocks[need.name] -= need.quantity;
    }

    // Add results
    for (const result of process.results) {
      this.currentStocks[result.name] =
        (this.currentStocks[result.name] || 0) + result.quantity;
    }

    this.inventory.push([processName, time]);
  }

  private getProcessPriority(process: Process): number {
    if (!this.targetProcess) return 0;

    // If this is our target process, highest priority
    if (process === this.targetProcess) return 100;

    // Check if this process produces any resources needed by target process
    let priority = 0;
    for (const result of process.results) {
      for (const targetNeed of this.targetProcess.needs) {
        if (result.name === targetNeed.name) {
          // Calculate how many more we need of this resource
          const currentAmount = this.currentStocks[result.name] || 0;
          const neededAmount = targetNeed.quantity;
          if (currentAmount < neededAmount) {
            // Higher priority if we're closer to having enough for target
            priority = 50 + (currentAmount / neededAmount) * 40;
          }
        }
      }
    }

    // Lower priority based on delay (normalized to 0-10 range)
    const maxDelay = Math.max(
      ...Object.values(this.processes).map((p) => p.delay)
    );
    const delayPenalty = (process.delay / maxDelay) * 10;
    priority -= delayPenalty;

    return priority;
  }

  private findBestProcess(availableProcesses: string[]): string | null {
    if (availableProcesses.length === 0) return null;

    // If we have a target process (assembly goal)
    if (this.targetProcess) {
      // Sort by priority
      return availableProcesses.reduce((best, current) => {
        if (!best) return current;
        const bestPriority = this.getProcessPriority(this.processes[best]);
        const currentPriority = this.getProcessPriority(
          this.processes[current]
        );
        return currentPriority > bestPriority ? current : best;
      });
    }

    // If optimizing for time or no specific optimization,
    // choose process with shortest delay
    return availableProcesses.reduce((best, current) => {
      if (!best) return current;
      return this.processes[current].delay < this.processes[best].delay
        ? current
        : best;
    });
  }

  public simulate(): SimulationResult {
    let time = 0;
    const startTime = Date.now();
    let previousStock = null;
    let isFinite = false;

    while (true) {
      // Check time limit
      if (Date.now() - startTime > this.delay) {
        break;
      }

      const availableProcesses = this.getAvailableProcesses();
      if (availableProcesses.length === 0) {
        isFinite = true;
        break;
      }

      const bestProcess = this.findBestProcess(availableProcesses);
      if (!bestProcess) break;

      this.applyProcess(bestProcess, time);
      time += this.processes[bestProcess].delay;

      // Check if we're in a steady state (no stock changes)
      const currentStockStr = JSON.stringify(this.currentStocks);
      if (previousStock === currentStockStr) {
        break;
      }
      previousStock = currentStockStr;
    }

    return {
      finalStocks: { ...this.currentStocks },
      processOrder: [...this.inventory],
      isFinite,
      totalTime: time
    };
  }

  public reset(): void {
    // Reset stocks to initial values
    for (const stock of Object.keys(this.currentStocks)) {
      this.currentStocks[stock] = 0;
    }
    this.inventory = [];
  }
}
