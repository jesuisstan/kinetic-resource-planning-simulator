# Kinetic Resource Planning Simulator

Simulator for optimizing and analyzing production process chains with resource constraints.

## Overview

This project simulates the execution of production processes with limited resources and dependencies. It helps analyze and optimize the order and timing of process execution to achieve goals such as minimizing total time or maximizing output.

- Original implementation in TypeScript 5.8.3
- No forbidden libraries used
- Fully compliant with the krpsim project requirements

## Features

- Reads configs with resources and processes
- Simulates process execution with delays and constraints
- Supports two algorithm modes: default (optimal) and bonus (exhaustive)
- Optimization by time or target resource
- Generates trace log for verification
- CLI interface
- Trace log verifier

## Algorithm Modes

The simulator supports two algorithm modes:

- **Default (optimal, fast):**

  - Implements an efficient algorithm (e.g., dynamic programming or graph search) to find an optimal solution for the given optimization goals (time, resource, or both).
  - Guaranteed to produce a correct and optimal result for any valid config.
  - Recommended for most use cases.

- **Bonus (exhaustive, perfect optimization, with `--bonus` flag):**
  - Uses an exhaustive search or provably perfect optimization algorithm (e.g., full search, branch & bound).
  - Always finds the best possible result for any valid config, even in the most complex scenarios.
  - May be significantly slower for large configs, but guarantees the perfect solution.
  - Intended for validation, research, or when absolute optimality is required.

You can select the algorithm mode by adding the `--bonus` flag to the command line.

## Project Structure

- `src/krpsim.ts` — main simulator (CLI)
- `src/krpsim_verif.ts` — trace log verifier (CLI)
- `src/` — source code (parser, core, utils)
- `resources/` — example configs and trace logs

## Requirements

- Node.js 20+
- TypeScript 5.8.3+

## Installation

```sh
npm install
```

## Build

```sh
npm run build
```

## Run Simulator

**Default mode (optimal, fast):**

```sh
npm start -- <config_file> <max_delay>
```

**Bonus mode (exhaustive, perfect optimization):**

```sh
npm start -- <config_file> <max_delay> --bonus
```

**For development (TypeScript directly):**

```sh
npx ts-node src/krpsim.ts <config_file> <max_delay> [--bonus]
```

**Run directly after build:**

```sh
node dist/krpsim.js <config_file> <max_delay> [--bonus]
```

## Run Verifier

**Using npm script:**

```sh
npm run verif -- <config_file> <trace_file>
```

**For development (TypeScript directly):**

```sh
npx ts-node src/krpsim_verif.ts <config_file> <trace_file>
```

**Run directly after build:**

```sh
node dist/krpsim_verif.js <config_file> <trace_file>
```

## Input File Format

- Comments: lines starting with `#`
- Stocks: `<stock_name>:<quantity>`
- Process: `<name>:(<need>:<qty>[;<need>:<qty>[...]]):(<result>:<qty>[;<result>:<qty>[...]]):<delay>`
- Optimization: `optimize:(time|<stock_name>[;...])`

## Output Format

- `<cycle>:<process_name>` — process execution
- Final stocks summary

## License

MIT
