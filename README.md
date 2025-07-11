# Production Chain Simulator

Simulator for optimizing and analyzing production process chains with resource constraints.

## Overview

This project simulates the execution of production processes with limited resources and dependencies. It helps analyze and optimize the order and timing of process execution to achieve goals such as minimizing total time or maximizing output.

- Original implementation in TypeScript 5.8.3
- No forbidden libraries used
- Fully compliant with the krpsim project requirements

## Features

- Reads configs with resources and processes
- Simulates process execution with delays and constraints
- Supports two algorithm modes: basic (greedy) and optimized
- Optimization by time or target resource
- Generates trace log for verification
- CLI interface
- Trace log verifier

## Algorithm Modes

The simulator supports two algorithm modes:

- **Basic (default):**

  - Simple greedy algorithm: always schedules the first available process in the order they appear in the config file.
  - Fast and easy to understand, but not guaranteed to find the optimal solution.

- **Optimized (with `--optimize` flag):**
  - Uses a more advanced algorithm to find a better (possibly optimal) schedule.
  - May take more time to compute, but can produce better results for complex scenarios.

You can select the algorithm mode by adding the `--optimize` flag to the command line.

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

**Using npm script (basic algorithm):**

```sh
npm start -- <config_file> <max_delay>
```

**Using npm script (optimized algorithm):**

```sh
npm start -- <config_file> <max_delay> --optimize
```

**For development (TypeScript directly):**

```sh
npx ts-node src/krpsim.ts <config_file> <max_delay> [--optimize]
```

**Run directly after build:**

```sh
node dist/krpsim.js <config_file> <max_delay> [--optimize]
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
