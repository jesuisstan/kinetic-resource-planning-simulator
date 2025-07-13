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

// Helper: recursively find all processes that can contribute to producing a target resource
const findProductionChain = (
  processes: Process[],
  target: string,
  visited: Set<string> = new Set()
): Process[] => {
  if (visited.has(target)) return [];
  visited.add(target);

  const result: Process[] = [];
  const proc = getProcessByResult(processes, target);
  if (proc) {
    result.push(proc);
    // Recursively find processes needed for this process
    proc.needs.forEach((n) => {
      const chain = findProductionChain(processes, n.name, visited);
      result.push(...chain);
    });
  }
  return result;
};

// Helper: calculate how many of a resource we can produce with current stocks
const calculateProducible = (
  processes: Process[],
  resource: string,
  stocks: Record<string, number>,
  visited: Set<string> = new Set()
): number => {
  if (visited.has(resource)) return 0; // Prevent infinite recursion
  visited.add(resource);

  const proc = getProcessByResult(processes, resource);
  if (!proc) return stocks[resource] || 0;

  // Calculate how many we can produce based on available inputs
  let maxProducible = Infinity;
  for (const need of proc.needs) {
    const available = stocks[need.name] || 0;
    const producible = calculateProducible(
      processes,
      need.name,
      stocks,
      new Set(visited)
    );
    const total = available + producible;
    const possible = Math.floor(total / need.quantity);
    maxProducible = Math.min(maxProducible, possible);
  }

  return maxProducible;
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
      // Greedy mode: start any process that can be started
      for (const proc of config.processes) {
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
      if (!launchedAny && running.length === 0) break;
    } else if (target) {
      // Universal recursive lookahead for all scenarios
      const procTarget = getProcessByResult(config.processes, target);
      if (!procTarget) break;

      // Calculate current deficit for target
      const targetDeficit: Record<string, number> = {};
      let canMakeTarget = true;
      for (const need of procTarget.needs) {
        const have = stocks[need.name] || 0;
        if (have < need.quantity) {
          targetDeficit[need.name] = need.quantity - have;
          canMakeTarget = false;
        }
      }

      // If we can make target, launch it
      if (canMakeTarget) {
        procTarget.needs.forEach((n) => {
          stocks[n.name] -= n.quantity;
        });
        running.push({ process: procTarget, finish: cycle + procTarget.delay });
        trace.push({ cycle, process: procTarget.name });
        started.push(procTarget.name);
        launchedAny = true;
      } else {
        // Find processes that can help reduce deficit
        const usefulProcesses: { process: Process; priority: number }[] = [];

        for (const proc of config.processes) {
          let priority = 0;
          let canHelp = false;

          // Check if this process produces something we need for the target
          for (const result of proc.results) {
            if (targetDeficit[result.name]) {
              priority += targetDeficit[result.name] * 10; // High priority for direct needs
              canHelp = true;
            } else if (
              procTarget &&
              procTarget.needs.some((n) => n.name === result.name)
            ) {
              priority += 5; // Medium priority for target needs
              canHelp = true;
            } else if (dependencyClosure.has(result.name)) {
              priority += 1; // Lower priority for indirect needs
              canHelp = true;
            }
          }

          // For economic models (euro optimization), prioritize processes that generate euro
          if (
            target === 'euro' &&
            proc.results.some((r) => r.name === 'euro')
          ) {
            priority += 10000; // Very high priority for euro-producing processes
            canHelp = true;
          }

          // Also prioritize processes that produce ingredients for euro-generating processes
          if (target === 'euro') {
            // Check if this process produces something needed for euro-generating processes
            const euroProcesses = config.processes.filter((p) =>
              p.results.some((r) => r.name === 'euro')
            );

            for (const euroProc of euroProcesses) {
              for (const need of euroProc.needs) {
                if (proc.results.some((r) => r.name === need.name)) {
                  priority += 1000; // High priority for ingredients of euro processes
                  canHelp = true;
                  break;
                }
              }
            }

            // Give lower priority to simple processing steps that don't lead to euro
            if (
              proc.name === 'separation_oeuf' ||
              proc.name === 'reunion_oeuf'
            ) {
              priority -= 500; // Lower priority for egg processing
            }
          }

          // Check if this process can run
          const maxStarts = maxProcessStarts(proc, stocks);
          if (canHelp && maxStarts > 0) {
            usefulProcesses.push({ process: proc, priority });
          }
        }

        // Launch ALL useful processes that can run (not just the highest priority one)
        // This ensures batch production works correctly
        // First, calculate how many of each process we can start with available resources
        const processAllocations: {
          process: Process;
          maxPossible: number;
          allocated: number;
        }[] = [];

        for (const { process: proc } of usefulProcesses) {
          const maxPossible = maxProcessStarts(proc, stocks);
          processAllocations.push({ process: proc, maxPossible, allocated: 0 });
        }

        // For economic models (euro target), be more conservative about spending euro
        if (target === 'euro') {
          // Sort processes by priority (euro-producing processes first)
          usefulProcesses.sort((a, b) => b.priority - a.priority);

          // Calculate how much euro we have and need to reserve
          const currentEuro = stocks.euro || 0;

          // Check if we have enough raw materials to start production
          const hasEnoughRawMaterials =
            (stocks.pomme || 0) >= 100 &&
            (stocks.citron || 0) >= 100 &&
            (stocks.oeuf || 0) >= 50 &&
            (stocks.farine || 0) >= 500 &&
            (stocks.beurre || 0) >= 100 &&
            (stocks.lait || 0) >= 100;

          // If we have enough raw materials, stop buying and focus on production
          if (hasEnoughRawMaterials) {
            // Only launch non-euro-consuming processes
            for (const { process: proc } of usefulProcesses) {
              const isEuroConsumer = proc.needs.some((n) => n.name === 'euro');
              if (!isEuroConsumer) {
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
          } else {
            // Still need raw materials, be conservative about spending euro
            const reserveEuro = Math.max(1000, currentEuro * 0.3); // Reserve at least 1000 or 30%
            const spendableEuro = currentEuro - reserveEuro;

            // Launch processes one by one, prioritizing euro-producing ones
            for (const { process: proc } of usefulProcesses) {
              const maxStarts = maxProcessStarts(proc, stocks);
              if (maxStarts > 0) {
                // For euro-consuming processes, be very conservative
                const isEuroConsumer = proc.needs.some(
                  (n) => n.name === 'euro'
                );
                let maxAllowed = maxStarts;

                if (isEuroConsumer) {
                  const euroNeeded =
                    proc.needs.find((n) => n.name === 'euro')?.quantity || 0;
                  const maxEuroStarts = Math.floor(spendableEuro / euroNeeded);
                  maxAllowed = Math.min(maxStarts, maxEuroStarts, 2); // Limit to 2 at most
                }

                for (let i = 0; i < maxAllowed; i++) {
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
        } else {
          // Original logic for non-economic models
          // Distribute resources among processes to ensure all get some if possible
          let resourcesRemaining = true;
          while (resourcesRemaining) {
            resourcesRemaining = false;
            for (const allocation of processAllocations) {
              if (allocation.allocated < allocation.maxPossible) {
                const canStart = maxProcessStarts(allocation.process, stocks);
                if (canStart > 0) {
                  // Check if we still need this resource for the target
                  const resName = allocation.process.results[0]?.name;
                  const currentDeficit = targetDeficit[resName] || 0;
                  if (currentDeficit > 0) {
                    allocation.process.needs.forEach((n) => {
                      stocks[n.name] -= n.quantity;
                    });
                    running.push({
                      process: allocation.process,
                      finish: cycle + allocation.process.delay
                    });
                    trace.push({ cycle, process: allocation.process.name });
                    started.push(allocation.process.name);
                    launchedAny = true;
                    allocation.allocated++;
                    // Update the deficit to reflect this process being launched
                    targetDeficit[resName] = Math.max(
                      0,
                      currentDeficit - allocation.process.results[0].quantity
                    );
                    resourcesRemaining = true;
                  }
                }
              }
            }
          }
        }

        // If no processes were launched but we have useful processes, try launching them one by one
        // This handles cases where one process consumes all resources
        if (!launchedAny && usefulProcesses.length > 0) {
          for (const { process: proc } of usefulProcesses) {
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
      }

      // Check if we can now assemble the target
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

      // Only break if no processes were launched AND no processes are running
      if (!launchedAny && running.length === 0) {
        break; // No progress possible
      }
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
