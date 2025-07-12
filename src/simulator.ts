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

  // Determine optimization mode
  // If we have specific stocks to optimize, prioritize them over time optimization
  let useGreedyMode = optimize.time && optimizeStocks.length === 0;
  let target = optimizeStocks[0];
  let batchNeeds: { name: string; quantity: number }[] = [];
  let topoOrder: Process[] = [];

  if (target) {
    const proc = getProcessByResult(config.processes, target);
    if (proc) {
      batchNeeds = proc.needs.map((n) => ({ ...n }));
      topoOrder = topoSortProcesses(config.processes, target);
      console.log(
        `Topological order for ${target}:`,
        topoOrder.map((p) => p.name)
      );
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

    if (useGreedyMode) {
      // Greedy mode: start any process that can be started
      let launchedAny = false;
      for (const proc of config.processes) {
        const maxStarts = maxProcessStarts(proc, stocks);
        if (maxStarts > 0) {
          // Start as many as possible
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
      if (!launchedAny && running.length === 0) break;
    } else if (target) {
      // Universal demand-propagation logic for target optimization
      // 1. Build demandMap: for each resource, how many needed for 1 target
      const demandMap: Record<string, number> = {};
      function buildDemand(res: string, qty: number) {
        demandMap[res] = (demandMap[res] || 0) + qty;
        const proc = getProcessByResult(config.processes, res);
        if (proc) {
          proc.needs.forEach((n) => buildDemand(n.name, n.quantity * qty));
        }
      }
      buildDemand(target, 1);
      let launchedAny = false;
      for (const p of topoOrder) {
        const resName = p.results[0]?.name;
        if (!resName || !demandMap[resName]) continue;
        // Сколько уже произведено этого ресурса?
        const have = stocks[resName] || 0;
        // Сколько ещё нужно для полного target?
        const need = demandMap[resName];
        const toProduce = Math.max(0, need - have);
        if (toProduce > 0) {
          let maxStarts = maxProcessStarts(p, stocks);
          maxStarts = Math.min(maxStarts, toProduce);
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
      // После производства всех компонентов, если хватает для сборки target, запускаем его
      const procTarget = getProcessByResult(config.processes, target);
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
      // fallback: do nothing
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
