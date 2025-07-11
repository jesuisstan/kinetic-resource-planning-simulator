#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="node" />

// Kinetic Resource Planning Simulator (TypeScript)
// CLI entry point

import { parseConfigFile, printConfigSummary, validateConfig } from './parser';
import { runSimulation } from './simulator';
import { runBonusSimulation } from './simulator_bonus';

const printUsage = (): void => {
  console.log('Usage: npm start -- <config_file> <max_delay>');
  console.log('       npx ts-node src/krpsim.ts <config_file> <max_delay>');
};

export const main = (): void => {
  const args = process.argv.slice(2);
  const bonus = args.includes('--bonus');
  const filteredArgs = args.filter((arg) => arg !== '--bonus');
  if (filteredArgs.length !== 2) {
    printUsage();
    process.exit(1);
  }
  const [configFile, maxDelayStr] = filteredArgs;
  const maxDelay = Number(maxDelayStr);
  if (isNaN(maxDelay) || maxDelay < 0) {
    console.error(
      'Invalid max_delay argument. It must be a non-negative integer.'
    );
    process.exit(1);
  }
  console.log(`Simulating with config: ${configFile}, max delay: ${maxDelay}`);
  try {
    const config = parseConfigFile(configFile);
    validateConfig(config);
    printConfigSummary(config);
    if (bonus) {
      runBonusSimulation(config, maxDelay);
    } else {
      runSimulation(config, maxDelay);
    }
  } catch (err) {
    console.error(
      'Failed to parse or validate config:',
      (err as Error).message
    );
    process.exit(1);
  }
};

main();
