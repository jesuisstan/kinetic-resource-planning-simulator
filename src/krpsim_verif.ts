#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="node" />

// Production Chain Verifier (TypeScript)
// CLI entry point

const printUsage = (): void => {
  console.log('Usage: npm run verif -- <config_file> <trace_file>');
  console.log(
    '       npx ts-node src/krpsim_verif.ts <config_file> <trace_file>'
  );
};

export const main = (): void => {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    printUsage();
    process.exit(1);
  }
  const [configFile, traceFile] = args;
  console.log(`Verifying trace: ${traceFile} with config: ${configFile}`);
  // TODO: implement verification logic
};

main();
