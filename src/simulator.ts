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

  // If optimize:time, use old greedy mode
  if (optimize.time && optimizeStocks.length === 0) {
    // ... old logic ...
    // (copy from previous version if needed)
  }

  // If optimize:stock, use strict dynamic planche reservation for remaining components
  const target = optimizeStocks[0];
  let batchNeeds: { name: string; quantity: number }[] = [];
  let topoOrder: Process[] = [];
  if (target) {
    const proc = getProcessByResult(config.processes, target);
    if (proc) {
      batchNeeds = proc.needs.map((n) => ({ ...n }));
      topoOrder = topoSortProcesses(config.processes, target);
    }
  }
  let targetsMade = 0;
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
          if (r.name === target) targetsMade += r.quantity;
        });
        finished.push(entry.process.name);
      }
      return entry.finish > cycle;
    });
    // Check if we have enough intermediate resources for one complete set
    const proc = getProcessByResult(config.processes, target);
    if (!proc) break;

    let canAssemble = proc.needs.every(
      (n) => (stocks[n.name] || 0) >= n.quantity
    );

    if (canAssemble) {
      // Start armoire assembly
      proc.needs.forEach((n) => {
        stocks[n.name] -= n.quantity;
      });
      running.push({ process: proc, finish: cycle + proc.delay });
      trace.push({ cycle, process: proc.name });
      started.push(proc.name);
    } else {
      // Find all needed processes in topological order that are actually needed for the complete set
      let launchedAny = false;
      for (const p of topoOrder) {
        if (p.name === proc.name) continue;
        const resName = p.results[0]?.name;
        if (!resName) continue;
        const needQty =
          batchNeeds.find((n) => n.name === resName)?.quantity || 0;
        const have = stocks[resName] || 0;
        // How many more of this resource do we need to produce for the complete set?
        const toProduce = Math.max(0, needQty - have);
        if (toProduce > 0) {
          // How many times can we start this process?
          let maxStarts = maxProcessStarts(p, stocks);
          maxStarts = Math.min(maxStarts, toProduce);

          // Start as many processes as possible
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
      // Continue working if there are running processes or we can start something
      if (!launchedAny && running.length === 0) {
        // Check if we can still produce anything from remaining resources
        let canProduceAnything = false;
        for (const p of config.processes) {
          if (maxProcessStarts(p, stocks) > 0) {
            canProduceAnything = true;
            break;
          }
        }
        if (!canProduceAnything) break;
      }
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
