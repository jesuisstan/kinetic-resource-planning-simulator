// parser.ts
// Парсер конфигурационного файла для симулятора производственных цепочек

export interface Stock {
  name: string;
  quantity: number;
}

export interface Process {
  name: string;
  needs: { name: string; quantity: number }[];
  results: { name: string; quantity: number }[];
  delay: number;
}

export interface OptimizeGoal {
  time: boolean;
  stocks: string[];
}

export interface ConfigData {
  stocks: Stock[];
  processes: Process[];
  optimize: OptimizeGoal;
}

export function parseConfigFile(path: string): ConfigData {
  // TODO: реализовать парсинг файла
  throw new Error('Not implemented');
}

export function validateConfig(config: ConfigData): void {
  // TODO: реализовать валидацию структуры
  throw new Error('Not implemented');
}
