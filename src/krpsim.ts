#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="node" />

// Kinetic Resource Planning Simulator (TypeScript)
// CLI entry point

import { parseConfigFile, printConfigSummary, validateConfig } from './parser';

const printUsage = (): void => {
  console.log('Usage: npm start -- <config_file> <max_delay>');
  console.log('       npx ts-node src/krpsim.ts <config_file> <max_delay>');
};

export const main = (): void => {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    printUsage();
    process.exit(1);
  }
  const [configFile, maxDelay] = args;
  console.log(`Simulating with config: ${configFile}, max delay: ${maxDelay}`);
  try {
    const config = parseConfigFile(configFile);
    validateConfig(config);
    printConfigSummary(config);
  } catch (err) {
    console.error(
      'Failed to parse or validate config:',
      (err as Error).message
    );
    process.exit(1);
  }
  // TODO: implement simulation logic
};

main();
