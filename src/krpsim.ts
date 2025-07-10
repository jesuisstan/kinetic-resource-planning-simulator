#!/usr/bin/env node

// Production Chain Simulator (TypeScript)
// CLI entry point

function printUsage() {
  console.log('Usage: npm start -- <config_file> <max_delay>');
  console.log('       npx ts-node src/krpsim.ts <config_file> <max_delay>');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    printUsage();
    process.exit(1);
  }
  const [configFile, maxDelay] = args;
  console.log(`Simulating with config: ${configFile}, max delay: ${maxDelay}`);
  // TODO: implement simulation logic
}

main();
