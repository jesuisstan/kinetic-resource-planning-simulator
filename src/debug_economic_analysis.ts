import { Config } from './types';
import { Parser } from './parser';

function analyzeEconomicLogic(filePath: string) {
  console.log('💰 ECONOMIC ANALYSIS OF PROCESSES');
  console.log('='.repeat(80));

  const parser = new Parser();
  const config = parser.parse(filePath);

  console.log(`📁 File: ${filePath}`);
  console.log(`🎯 Optimization goals: ${config.optimizeGoals.join(', ')}`);
  console.log();

  // Build resource dependency graph
  const resourceProducers = new Map<string, Set<string>>();
  const resourceConsumers = new Map<string, Set<string>>();

  for (const process of config.processes) {
    for (const [output] of process.outputs) {
      if (!resourceProducers.has(output)) {
        resourceProducers.set(output, new Set());
      }
      resourceProducers.get(output)!.add(process.name);
    }
    for (const [input] of process.inputs) {
      if (!resourceConsumers.has(input)) {
        resourceConsumers.set(input, new Set());
      }
      resourceConsumers.get(input)!.add(process.name);
    }
  }

  // Analyze each process for economic value
  console.log('📊 PROCESS ECONOMIC ANALYSIS:');
  console.log();

  const goalSet = new Set(config.optimizeGoals);

  const processAnalysis = new Map<
    string,
    {
      inputCost: number;
      outputValue: number;
      profit: number;
      profitMargin: number;
      euroInputs: number;
      euroOutputs: number;
      description: string;
    }
  >();

  for (const process of config.processes) {
    let totalInputCost = 0;
    let totalOutputValue = 0;
    let euroInputs = 0;
    let euroOutputs = 0;
    let description = '';

    // Calculate input costs based on optimization goals
    for (const [input, quantity] of process.inputs) {
      if (goalSet.has(input)) {
        // Optimization goals have intrinsic value
        totalInputCost += quantity * 100; // Base value for optimization goals
        euroInputs += quantity * 100;
        description += `💰 Costs ${quantity} ${input} (optimization goal)`;
      } else {
        // Estimate cost based on processes that produce this resource
        const producers = resourceProducers.get(input);
        if (producers) {
          let minCost = Infinity;
          for (const producerName of producers) {
            const producer = config.processes.find(
              (p) => p.name === producerName
            );
            if (producer) {
              // Find cost through optimization goals
              for (const [producerInput, producerQuantity] of producer.inputs) {
                if (goalSet.has(producerInput)) {
                  const outputQuantity = producer.outputs.get(input) || 1;
                  const costPerUnit = (producerQuantity * 100) / outputQuantity;
                  minCost = Math.min(minCost, costPerUnit * quantity);
                }
              }
            }
          }
          if (minCost !== Infinity) {
            totalInputCost += minCost;
            description += `, ${input} costs ~${minCost.toFixed(
              0
            )} (via optimization goals)`;
          }
        }
      }
    }

    // Calculate output values based on optimization goals
    for (const [output, quantity] of process.outputs) {
      if (goalSet.has(output)) {
        // Optimization goals have intrinsic value
        totalOutputValue += quantity * 100; // Base value for optimization goals
        euroOutputs += quantity * 100;
        description += ` → 💰 Produces ${quantity} ${output} (optimization goal)`;
      } else {
        // Estimate value based on processes that consume this resource
        const consumers = resourceConsumers.get(output);
        if (consumers) {
          let maxValue = 0;
          for (const consumerName of consumers) {
            const consumer = config.processes.find(
              (p) => p.name === consumerName
            );
            if (consumer) {
              // Find value through optimization goals
              for (const [
                consumerOutput,
                consumerQuantity
              ] of consumer.outputs) {
                if (goalSet.has(consumerOutput)) {
                  const inputQuantity = consumer.inputs.get(output) || 1;
                  const valuePerUnit = (consumerQuantity * 100) / inputQuantity;
                  maxValue = Math.max(maxValue, valuePerUnit * quantity);
                }
              }
            }
          }
          totalOutputValue += maxValue;
          if (maxValue > 0) {
            description += ` → ${output} worth ~${maxValue.toFixed(
              0
            )} (via optimization goals)`;
          }
        }
      }
    }

    const profit = totalOutputValue - totalInputCost;
    const profitMargin = totalInputCost > 0 ? profit / totalInputCost : profit;

    processAnalysis.set(process.name, {
      inputCost: totalInputCost,
      outputValue: totalOutputValue,
      profit,
      profitMargin,
      euroInputs,
      euroOutputs,
      description
    });
  }

  // Sort processes by profit margin
  const sortedProcesses = Array.from(processAnalysis.entries()).sort(
    (a, b) => b[1].profitMargin - a[1].profitMargin
  );

  for (const [processName, analysis] of sortedProcesses) {
    const process = config.processes.find((p) => p.name === processName);
    if (!process) continue;

    console.log(`🔸 ${processName}:`);
    console.log(`   Input cost: ${analysis.inputCost.toFixed(0)} euro`);
    console.log(`   Output value: ${analysis.outputValue.toFixed(0)} euro`);
    console.log(`   Profit: ${analysis.profit.toFixed(0)} euro`);
    console.log(
      `   Profit margin: ${(analysis.profitMargin * 100).toFixed(1)}%`
    );

    if (analysis.euroOutputs > 0) {
      console.log(
        `   💰 Direct optimization goal output: ${analysis.euroOutputs}`
      );
    }
    if (analysis.euroInputs > 0) {
      console.log(
        `   💸 Direct optimization goal input: ${analysis.euroInputs}`
      );
    }

    console.log(`   📝 ${analysis.description}`);
    console.log();
  }

  // Special analysis for complex processes
  console.log('🎯 SPECIAL ANALYSIS FOR COMPLEX PROCESSES:');
  console.log();

  // Find processes that require many inputs
  const complexProcesses = config.processes.filter((p) => p.inputs.size >= 3);

  for (const process of complexProcesses) {
    const analysis = processAnalysis.get(process.name);
    if (!analysis) continue;

    console.log(
      `🔸 ${process.name} (Complex process with ${process.inputs.size} inputs):`
    );
    console.log(
      `   Inputs: ${Array.from(process.inputs.entries())
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')}`
    );
    console.log(
      `   Outputs: ${Array.from(process.outputs.entries())
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')}`
    );
    console.log(`   Duration: ${process.nbCycle} cycles`);
    console.log(
      `   Profit margin: ${(analysis.profitMargin * 100).toFixed(1)}%`
    );

    // Check if this process is part of a chain
    const outputs = Array.from(process.outputs.keys());
    const consumers = outputs.flatMap((output) => {
      const consumers = resourceConsumers.get(output);
      return consumers ? Array.from(consumers) : [];
    });

    if (consumers.length > 0) {
      console.log(`   🔗 Used by: ${consumers.join(', ')}`);

      // Check if any consumer produces optimization goals
      const goalConsumers = consumers.filter((consumerName) => {
        const consumer = config.processes.find((p) => p.name === consumerName);
        return (
          consumer &&
          Array.from(consumer.outputs.keys()).some((output) =>
            goalSet.has(output)
          )
        );
      });

      if (goalConsumers.length > 0) {
        console.log(
          `   💰 Chain leads to optimization goals: ${goalConsumers.join(', ')}`
        );
      }
    }
    console.log();
  }

  // Analysis of resource chains
  console.log('🔗 RESOURCE CHAIN ANALYSIS:');
  console.log();

  // Find resources that are produced by one process and consumed by another
  const chainResources = new Set<string>();
  for (const process of config.processes) {
    for (const [output] of process.outputs) {
      const consumers = resourceConsumers.get(output);
      if (consumers && consumers.size > 0) {
        chainResources.add(output);
      }
    }
  }

  for (const resource of Array.from(chainResources).sort()) {
    const producers = resourceProducers.get(resource);
    const consumers = resourceConsumers.get(resource);

    if (!producers || !consumers) continue;

    console.log(`🔸 ${resource}:`);
    console.log(`   Produced by: ${Array.from(producers).join(', ')}`);
    console.log(`   Consumed by: ${Array.from(consumers).join(', ')}`);

    // Check if this chain leads to optimization goals
    const goalConsumers = Array.from(consumers).filter((consumerName) => {
      const consumer = config.processes.find((p) => p.name === consumerName);
      return (
        consumer &&
        Array.from(consumer.outputs.keys()).some((output) =>
          goalSet.has(output)
        )
      );
    });

    if (goalConsumers.length > 0) {
      console.log(
        `   💰 Chain leads to optimization goals: ${goalConsumers.join(', ')}`
      );
    }
    console.log();
  }

  // Recommendations
  console.log('💡 RECOMMENDATIONS:');
  console.log();

  const highValueProcesses = sortedProcesses.filter(
    ([_, analysis]) => analysis.profitMargin > 10
  );
  const lowValueProcesses = sortedProcesses.filter(
    ([_, analysis]) => analysis.profitMargin < 0
  );

  if (highValueProcesses.length > 0) {
    console.log('✅ HIGH-VALUE PROCESSES (prioritize these):');
    for (const [processName, analysis] of highValueProcesses.slice(0, 5)) {
      console.log(
        `   • ${processName}: ${(analysis.profitMargin * 100).toFixed(
          1
        )}% profit margin`
      );
    }
    console.log();
  }

  if (lowValueProcesses.length > 0) {
    console.log('⚠️  LOW-VALUE PROCESSES (avoid unless necessary):');
    for (const [processName, analysis] of lowValueProcesses.slice(0, 5)) {
      console.log(
        `   • ${processName}: ${(analysis.profitMargin * 100).toFixed(
          1
        )}% profit margin`
      );
    }
    console.log();
  }

  // Check for missing high-value chains
  const goalProducers = config.processes.filter((p) =>
    Array.from(p.outputs.keys()).some((output) => goalSet.has(output))
  );
  const highValueGoalProducers = goalProducers.filter((p) => {
    const analysis = processAnalysis.get(p.name);
    return analysis && analysis.profitMargin > 50;
  });

  if (highValueGoalProducers.length > 0) {
    console.log('🎯 HIGH-VALUE OPTIMIZATION GOAL PRODUCERS:');
    for (const process of highValueGoalProducers) {
      const analysis = processAnalysis.get(process.name);
      if (analysis) {
        console.log(
          `   • ${process.name}: ${
            analysis.euroOutputs
          } optimization goal value, ${(analysis.profitMargin * 100).toFixed(
            1
          )}% margin`
        );

        // Check if this process has complex requirements
        if (process.inputs.size > 2) {
          console.log(
            `     Requires: ${Array.from(process.inputs.entries())
              .map(([k, v]) => `${k}:${v}`)
              .join(', ')}`
          );
          console.log(`     Consider building supply chain for this process`);
        }
      }
    }
  }
}

// Run with command line arguments
if (process.argv.length < 3) {
  console.error('Usage: npm run debug-economic -- <filename>');
  process.exit(1);
}

const filePath = process.argv[2];
analyzeEconomicLogic(filePath);
