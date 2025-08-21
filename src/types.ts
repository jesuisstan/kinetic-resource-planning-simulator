export interface Stock {
  [key: string]: number;
}

export interface Process {
  name: string;
  need: Stock;
  result: Stock;
  delay: number;
  startCycle?: number;
}

export interface ProcessList {
  [key: string]: Process;
}

export interface InstructionDict {
  [key: string]: number;
}

export interface GoodInstruction {
  cycle: number;
  processes: string[];
}

export interface TodoList {
  [cycle: number]: string[];
}

export interface SimulationConfig {
  maxCycle: number;
  maxDelay: number;
  maxInstructions: number;
  maxGenerations: number;
  fileName: string;
  optimizationTarget: string;
  stock: Stock;
  processList: ProcessList;
}
