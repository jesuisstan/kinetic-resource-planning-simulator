export type Stock = {
  readonly name: string;
  readonly quantity: number;
};

export type Process = {
  readonly name: string;
  readonly inputs: ReadonlyMap<string, number>;
  readonly outputs: ReadonlyMap<string, number>;
  readonly nbCycle: number;
};

export type Config = {
  readonly processes: readonly Process[];
  readonly stocks: readonly Stock[];
  readonly optimizeGoals: readonly string[];
};

export type Individual = {
  readonly processSequence: readonly string[];
  fitnessScore: number; // Not readonly since we need to update this
};

export type SimulationResult = {
  readonly finalStocks: ReadonlyMap<string, number>;
  readonly executionLog: ReadonlyArray<[number, string]>;
  readonly finalCycle: number;
  readonly fitness: number;
  readonly timeoutReached: boolean;
};

// Pure functions for state management
export type StockState = Map<string, number>;
