import { Config } from './types';
import { Parser } from './parser';
import { analyzeResourceChains, printChainAnalysis } from './chainAnalysis';

function analyzeChainLogic(filePath: string) {
  console.log('🔗 DEEP CHAIN ANALYSIS TOOL');
  console.log(
    '================================================================================'
  );
  console.log(`📁 File: ${filePath}`);

  // Parse configuration
  const parser = new Parser();
  const config = parser.parse(filePath);
  console.log(`🎯 Optimization goals: ${config.optimizeGoals.join(', ')}`);
  console.log();

  // Perform deep chain analysis
  const analysis = analyzeResourceChains(config);

  // Print analysis results
  printChainAnalysis(analysis);

  // Additional insights
  console.log('\n💡 KEY INSIGHTS:');

  // Find the most valuable goal strategy
  let bestGoal = '';
  let bestValue = 0;
  for (const [goal, strategy] of analysis.goalStrategies) {
    if (strategy.totalValue > bestValue) {
      bestValue = strategy.totalValue;
      bestGoal = goal;
    }
  }

  if (bestGoal) {
    const strategy = analysis.goalStrategies.get(bestGoal)!;
    console.log(`\n🎯 BEST GOAL: ${bestGoal}`);
    console.log(`   Strategy: ${strategy.bestStrategy.process}`);
    console.log(`   Value: ${strategy.totalValue}`);
    console.log(
      `   Scale multiplier: ${strategy.bestStrategy.scaleMultiplier}x`
    );

    if (strategy.bestStrategy.scaleMultiplier > 1) {
      console.log(`   ⚠️  This requires large-scale production!`);
      console.log(`   📊 Scale requirements:`);
      for (const [resource, requirement] of analysis.scaleRequirements) {
        if (requirement.deficit > 0) {
          console.log(`      • ${resource}: need ${requirement.deficit} more`);
          console.log(
            `        (requires ${requirement.timeToProduce} cycles to produce)`
          );
        }
      }
    }
  }

  // Find critical bottlenecks
  console.log('\n🚧 CRITICAL BOTTLENECKS:');
  const bottlenecks = Array.from(analysis.scaleRequirements.values())
    .filter((req) => req.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, 5);

  for (const bottleneck of bottlenecks) {
    console.log(`\n🔸 ${bottleneck.resource}:`);
    console.log(`   Deficit: ${bottleneck.deficit}`);
    console.log(`   Time to produce: ${bottleneck.timeToProduce} cycles`);

    if (bottleneck.requiredProcesses.size > 0) {
      console.log(`   Required processes:`);
      for (const [process, count] of bottleneck.requiredProcesses) {
        console.log(`     • ${process}: ${count} times`);
      }
    }
  }

  // Find high-value chain processes
  console.log('\n💰 HIGH-VALUE CHAIN PROCESSES:');
  const highValueProcesses = Array.from(analysis.processStrategies.values())
    .filter((strategy) => strategy.chainValue > strategy.directValue)
    .sort((a, b) => b.chainValue - a.chainValue)
    .slice(0, 5);

  for (const process of highValueProcesses) {
    console.log(`\n🔸 ${process.process}:`);
    console.log(`   Chain value: ${process.chainValue}`);
    console.log(`   Direct value: ${process.directValue}`);
    console.log(`   Production steps: ${process.productionSteps}`);
    console.log(`   Scale multiplier: ${process.scaleMultiplier}x`);
  }

  // Recommendations
  console.log('\n📋 RECOMMENDATIONS:');

  if (
    bestGoal &&
    analysis.goalStrategies.get(bestGoal)!.bestStrategy.scaleMultiplier > 1
  ) {
    console.log('\n🎯 FOR HIGH-SCALE PRODUCTION:');
    console.log('   1. Accumulate resources before starting production');
    console.log('   2. Focus on bottleneck resources first');
    console.log('   3. Plan the entire supply chain before execution');
    console.log('   4. Consider parallel production of different components');
  }

  const complexProcesses = Array.from(analysis.processStrategies.values())
    .filter((strategy) => strategy.complexity > 3)
    .sort((a, b) => b.chainValue - a.chainValue)
    .slice(0, 3);

  if (complexProcesses.length > 0) {
    console.log('\n🔧 FOR COMPLEX PROCESSES:');
    for (const process of complexProcesses) {
      console.log(
        `   • ${process.process}: ${process.complexity} inputs, ${process.chainValue} chain value`
      );
    }
    console.log('   1. Build supply chains for complex processes');
    console.log('   2. Prioritize processes with high chain value');
    console.log('   3. Consider resource accumulation strategies');
  }

  console.log(
    '\n================================================================================'
  );
}

// Command line interface
if (require.main === module) {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: npm run debug-chain -- <config_file>');
    console.error('Example: npm run debug-chain -- resources/pomme');
    process.exit(1);
  }

  try {
    analyzeChainLogic(filePath);
  } catch (error) {
    console.error('Error analyzing chain:', error);
    process.exit(1);
  }
}
