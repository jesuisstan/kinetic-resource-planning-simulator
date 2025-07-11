import { ConfigData, Stock, Process, OptimizeGoal } from './parser';

export interface SimulationResult {
  trace: { cycle: number; process: string }[];
  stepLogs: StepLog[];
  finalStocks: Record<string, number>;
  lastCycle: number;
}

interface SimulationOptions {
  optimize?: boolean;
}

export interface StepLog {
  time: number;
  stocksBefore: Record<string, number>;
  stocksAfter: Record<string, number>;
  started: string[];
  finished: string[];
}

const cloneStocks = (stocks: Stock[]): Record<string, number> => {
  const result: Record<string, number> = {};
  stocks.forEach((s) => {
    result[s.name] = s.quantity;
  });
  return result;
};

// Build a map: resource -> processes that produce it
const buildResourceProducers = (
  processes: Process[]
): Record<string, Process[]> => {
  const map: Record<string, Process[]> = {};
  processes.forEach((proc) => {
    proc.results.forEach((r) => {
      if (!map[r.name]) map[r.name] = [];
      map[r.name].push(proc);
    });
  });
  return map;
};

// Calculate process priorities: lower number = higher priority
const calculateProcessPriorities = (
  processes: Process[],
  optimizeStocks: string[]
): Map<string, number> => {
  const resourceProducers = buildResourceProducers(processes);
  const priorities = new Map<string, number>();
  const visited = new Set<string>();
  let currentPriority = 0;

  // BFS from each optimize stock
  const queue: { resource: string; depth: number }[] = optimizeStocks.map(
    (r) => ({ resource: r, depth: 0 })
  );
  while (queue.length > 0) {
    const { resource, depth } = queue.shift()!;
    if (visited.has(resource)) continue;
    visited.add(resource);
    const procs = resourceProducers[resource] || [];
    procs.forEach((proc) => {
      if (!priorities.has(proc.name) || priorities.get(proc.name)! > depth) {
        priorities.set(proc.name, depth);
        // Add needs of this process to queue with depth+1
        proc.needs.forEach((n) => {
          queue.push({ resource: n.name, depth: depth + 1 });
        });
      }
    });
  }
  // For processes not in the chain, assign a lower priority (higher number)
  processes.forEach((proc, idx) => {
    if (!priorities.has(proc.name)) priorities.set(proc.name, 1000 + idx);
  });
  return priorities;
};

// Returns true if process is in the chain leading to any optimize stock
const isProcessInOptimizeChain = (
  proc: Process,
  priorities: Map<string, number>,
  optimize: OptimizeGoal
): boolean => {
  if (optimize.time) return true; // time mode: allow all
  // If any optimize stock, allow only those in the chain
  return priorities.get(proc.name)! < 1000;
};

export const runSimulation = (
  config: ConfigData,
  maxDelay: number,
  options: SimulationOptions = {}
): SimulationResult => {
  const stocks = cloneStocks(config.stocks);
  const trace: { cycle: number; process: string }[] = [];
  let time = 0;
  let running: { process: Process; finish: number }[] = [];
  const stepLogs: StepLog[] = [];

  const optimizeStocks =
    config.optimize.stocks.length > 0 ? config.optimize.stocks : [];
  const priorities = calculateProcessPriorities(
    config.processes,
    optimizeStocks
  );
  const optimize = config.optimize;

  while (time <= maxDelay) {
    const stocksBefore = { ...stocks };
    const finished: string[] = [];
    running = running.filter((entry) => {
      if (entry.finish === time) {
        entry.process.results.forEach((r) => {
          stocks[r.name] = (stocks[r.name] || 0) + r.quantity;
        });
        finished.push(entry.process.name);
      }
      return entry.finish > time;
    });
    let startable: Process[] = config.processes.filter((proc) =>
      proc.needs.every((n) => (stocks[n.name] || 0) >= n.quantity)
    );
    // Filter by optimize: if optimize.stocks is not empty, allow only processes in the chain to the target resource
    if (!optimize.time && optimize.stocks.length > 0) {
      startable = startable.filter((proc) =>
        isProcessInOptimizeChain(proc, priorities, optimize)
      );
    }
    // Sorting: if both time and stocks are present, prioritize processes leading to the target resource
    startable.sort((a, b) => priorities.get(a.name)! - priorities.get(b.name)!);

    let anyStarted = false;
    const started: string[] = [];
    for (const proc of startable) {
      if (proc.needs.every((n) => (stocks[n.name] || 0) >= n.quantity)) {
        proc.needs.forEach((n) => {
          stocks[n.name] -= n.quantity;
        });
        running.push({ process: proc, finish: time + proc.delay });
        trace.push({ cycle: time, process: proc.name });
        started.push(proc.name);
        anyStarted = true;
      }
    }
    const stocksAfter = { ...stocks };
    if (started.length > 0 || finished.length > 0) {
      stepLogs.push({ time, stocksBefore, stocksAfter, started, finished });
    }
    if (!anyStarted && running.length === 0) break;
    time++;
  }

  return {
    trace,
    stepLogs,
    finalStocks: { ...stocks },
    lastCycle: time - 1
  };
};
