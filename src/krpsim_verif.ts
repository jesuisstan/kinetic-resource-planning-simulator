#!/usr/bin/env node

// Production Chain Verifier (TypeScript)
// CLI entry point

function printUsage() {
  console.log('Usage: npm run verif -- <config_file> <trace_file>');
  console.log(
    '       npx ts-node src/krpsim_verif.ts <config_file> <trace_file>'
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    printUsage();
    process.exit(1);
  }
  const [configFile, traceFile] = args;
  console.log(`Verifying trace: ${traceFile} with config: ${configFile}`);
  // TODO: implement verification logic
}

main();
