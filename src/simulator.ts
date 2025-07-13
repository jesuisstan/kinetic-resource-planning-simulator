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

// Helper: compute how many times a process can be started with current stocks
const maxProcessStarts = (
  proc: Process,
  stocks: Record<string, number>
): number => {
  return Math.min(
    ...proc.needs.map((n) => Math.floor((stocks[n.name] || 0) / n.quantity))
  );
};

// Helper: get process by result resource name
const getProcessByResult = (
  processes: Process[],
  resource: string
): Process | undefined => {
  return processes.find((p) => p.results.some((r) => r.name === resource));
};

// Helper: topological sort of processes for a target resource
const topoSortProcesses = (processes: Process[], target: string): Process[] => {
  const result: Process[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>(); // Track resources being visited to detect cycles
  const processMap = new Map<string, Process>();
  processes.forEach((p) => processMap.set(p.name, p));
  // Map resource -> process that produces it
  const resourceToProcess = new Map<string, Process>();
  processes.forEach((p) => {
    p.results.forEach((r) => resourceToProcess.set(r.name, p));
  });

  function visitResource(res: string) {
    const proc = resourceToProcess.get(res);
    if (!proc || visited.has(proc.name)) return;

    // Check for cycles
    if (visiting.has(res)) {
      console.warn(`Cycle detected for resource: ${res}, skipping`);
      return;
    }

    visiting.add(res);
    proc.needs.forEach((n) => visitResource(n.name));
    visiting.delete(res);

    if (!visited.has(proc.name)) {
      result.push(proc);
      visited.add(proc.name);
    }
  }

  try {
    visitResource(target);
  } catch (error) {
    console.warn(`Error in topological sort for target ${target}:`, error);
    // Return empty array if sorting fails
    return [];
  }

  return result;
};

// Helper: get all resources that are on the path to the target (dependency closure)
const getDependencyClosure = (
  processes: Process[],
  target: string
): Set<string> => {
  const closure = new Set<string>();
  const visited = new Set<string>();
  function visit(res: string) {
    if (visited.has(res)) return;
    visited.add(res);
    closure.add(res);
    const proc = getProcessByResult(processes, res);
    if (proc) {
      proc.needs.forEach((n) => visit(n.name));
    }
  }
  visit(target);
  return closure;
};

export const runSimulation = (
  config: ConfigData,
  maxDelay: number,
  options: SimulationOptions = {}
): SimulationResult => {
  const stocks = cloneStocks(config.stocks);
  const trace: { cycle: number; process: string }[] = [];
  let running: { process: Process; finish: number }[] = [];
  const stepLogs: StepLog[] = [];

  const optimizeStocks =
    config.optimize.stocks.length > 0 ? config.optimize.stocks : [];
  const optimize = config.optimize;

  let useGreedyMode = optimize.time && optimizeStocks.length === 0;
  let target = optimizeStocks[0];
  let topoOrder: Process[] = [];
  let dependencyClosure: Set<string> = new Set();

  if (target) {
    const proc = getProcessByResult(config.processes, target);
    if (proc) {
      topoOrder = topoSortProcesses(config.processes, target);
      dependencyClosure = getDependencyClosure(config.processes, target);
    }
  }
  let cycle = 0;
  while (cycle <= maxDelay) {
    const stocksBefore = { ...stocks };
    const started: string[] = [];
    const finished: string[] = [];

    // Complete processes that finish in this cycle
    running = running.filter((entry) => {
      if (entry.finish === cycle) {
        entry.process.results.forEach((r) => {
          stocks[r.name] = (stocks[r.name] || 0) + r.quantity;
        });
        finished.push(entry.process.name);
      }
      return entry.finish > cycle;
    });

    let launchedAny = false;
    if (useGreedyMode) {
      for (const proc of config.processes) {
        if (
          optimize.time ||
          dependencyClosure.size === 0 ||
          proc.results.some((r) => dependencyClosure.has(r.name))
        ) {
          const maxStarts = maxProcessStarts(proc, stocks);
          if (maxStarts > 0) {
            for (let i = 0; i < maxStarts; i++) {
              proc.needs.forEach((n) => {
                stocks[n.name] -= n.quantity;
              });
              running.push({ process: proc, finish: cycle + proc.delay });
              trace.push({ cycle, process: proc.name });
              started.push(proc.name);
              launchedAny = true;
            }
          }
        }
      }
      if (!launchedAny && running.length === 0) break;
    } else if (target) {
      // Universal batch+cycle lookahead for target optimization
      // 1. Build dependency closure for all resources needed for the target
      // 2. For each resource, compute how many are needed for a full set
      // 3. Launch processes that produce any resource in the closure if there is a deficit for a full set
      // 4. For cycles, allow launching if the process can increase any needed resource and there are still base resources
      const demandMap: Record<string, number> = {};
      const visited = new Set<string>();
      function buildDemand(res: string, qty: number) {
        if (visited.has(res)) return;
        visited.add(res);
        demandMap[res] = (demandMap[res] || 0) + qty;
        const proc = getProcessByResult(config.processes, res);
        if (proc) {
          proc.needs.forEach((n) => buildDemand(n.name, n.quantity * qty));
        }
      }
      buildDemand(target, 1);
      // For batch: how many full sets of the target can we make with current stocks?
      const procTarget = getProcessByResult(config.processes, target);
      let maxFullSets = Infinity;
      if (procTarget) {
        for (const n of procTarget.needs) {
          const have = stocks[n.name] || 0;
          const possible = Math.floor(have / n.quantity);
          maxFullSets = Math.min(maxFullSets, possible);
        }
      }
      // For each resource in closure, compute how many are needed for one more full set
      const neededForFullSet: Record<string, number> = {};
      if (procTarget) {
        for (const n of procTarget.needs) {
          const have = stocks[n.name] || 0;
          const need = n.quantity * (maxFullSets + 1) - have;
          if (need > 0) neededForFullSet[n.name] = need;
        }
      }
      // For each process in topoOrder, launch if it produces a resource needed for a full set and we have a deficit
      for (const p of topoOrder) {
        const resName = p.results[0]?.name;
        if (!resName || !dependencyClosure.has(resName)) continue;
        // If this resource is needed for a full set and we have a deficit, launch
        if (neededForFullSet[resName]) {
          let maxStarts = Math.min(
            maxProcessStarts(p, stocks),
            neededForFullSet[resName]
          );
          for (let i = 0; i < maxStarts; i++) {
            p.needs.forEach((n) => {
              stocks[n.name] -= n.quantity;
            });
            running.push({ process: p, finish: cycle + p.delay });
            trace.push({ cycle, process: p.name });
            started.push(p.name);
            launchedAny = true;
          }
        } else {
          // For cycles: if process can run and produces a resource in closure, allow if it increases any needed resource
          let maxStarts = maxProcessStarts(p, stocks);
          if (maxStarts > 0 && Object.keys(neededForFullSet).length > 0) {
            for (let i = 0; i < maxStarts; i++) {
              p.needs.forEach((n) => {
                stocks[n.name] -= n.quantity;
              });
              running.push({ process: p, finish: cycle + p.delay });
              trace.push({ cycle, process: p.name });
              started.push(p.name);
              launchedAny = true;
            }
          }
        }
      }
      // Launch the final assembly process if all needs are met
      if (
        procTarget &&
        procTarget.needs.every((n) => (stocks[n.name] || 0) >= n.quantity)
      ) {
        procTarget.needs.forEach((n) => {
          stocks[n.name] -= n.quantity;
        });
        running.push({ process: procTarget, finish: cycle + procTarget.delay });
        trace.push({ cycle, process: procTarget.name });
        started.push(procTarget.name);
        launchedAny = true;
      }
      if (!launchedAny && running.length === 0) break;
    } else {
      break;
    }

    if (started.length > 0 || finished.length > 0) {
      stepLogs.push({
        time: cycle,
        stocksBefore,
        stocksAfter: { ...stocks },
        started,
        finished
      });
    }
    cycle++;
  }
  return {
    trace,
    stepLogs,
    finalStocks: { ...stocks },
    lastCycle: cycle - 1
  };
};
