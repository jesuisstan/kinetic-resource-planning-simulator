export interface Stock {
  name: string;
  quantity: number;
}

export interface Process {
  name: string;
  inputs: Map<string, number>;
  outputs: Map<string, number>;
  nbCycle: number;
}

export interface Config {
  stocks: Map<string, number>;
  processes: Map<string, Process>;
  optimizeGoals: string[];
}

export interface Individual {
  genes: Array<{
    process: string;
    amount: number;
    parallel: boolean;
  }>;
  fitness: number;
}

export interface ResourceDiff {
  consumed: Map<string, number>;
  produced: Map<string, number>;
}
