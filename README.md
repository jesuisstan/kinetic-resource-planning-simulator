# Kinetic Resource Planning Simulator

TypeScript implementation of the resource planning simulator (krpsim) for Ecole42 project.

## Installation and Build

```bash
# Install dependencies
npm install

# Build project
npm run build

# Run in development mode
npm run dev
```

## Running the Program

### Main krpsim Program

```bash
# Built version
node dist/krpsim.js <configuration_file> <max_time>

# Development mode
npm run dev resources/simple 10
```

Examples:

```bash
# Simple configuration
node dist/krpsim.js resources/simple 10

# Steak configuration
node dist/krpsim.js resources/steak 30

# IKEA configuration
node dist/krpsim.js resources/ikea 50

# Self-sustaining configuration
node dist/krpsim.js resources/recre 100

# Apple configuration
node dist/krpsim.js resources/pomme 1000

# Nested processes configuration
node dist/krpsim.js resources/inception 100
```

### krpsim_verif Verification Program

```bash
# Using npm script
npm run krpsim_verif resources/simple resources/simple.log

# Or directly
node dist/krpsim_verif.js resources/simple resources/simple.log
```

Examples:

```bash
# Verify simple configuration
npm run krpsim_verif resources/simple resources/simple.log

# Verify apple configuration
npm run krpsim_verif resources/pomme resources/pomme.log
```

## Command Line Parameters

### krpsim.js

- `file` - configuration file (required)
- `delay` - maximum execution time in seconds (required)
- `-c, --cycle` - maximum number of cycles (default: 10000)
- `-p, --process` - maximum number of processes (default: 1000)
- `-i, --instructions` - maximum number of instructions (default: 10000)

### krpsim_verif.js

- `file` - configuration file (required)
- `trace.log` - result file for verification (required, .log extension)

## NPM Scripts

```bash
# Main commands
npm run build          # Build project
npm run dev            # Run in development mode
npm run clean          # Remove build files and .log files
npm run clean_all      # Remove build files, .log files, node_modules and package-lock.json
npm run krpsim_verif   # Run verifier
```

## Project Structure

- `src/types.ts` - TypeScript types and interfaces
- `src/utils.ts` - utilities for stocks, processes and errors
- `src/MainWalk.ts` - main simulation class
- `src/krpsim.ts` - main simulator program
- `src/krpsim_verif.ts` - result verification program
- `resources/` - configuration files folder
- `dist/` - compiled JavaScript files

## Configuration Files

- `simple` - simple process chain (buy material → produce → deliver)
- `steak` - steak cooking (should take 30 cycles)
- `ikea` - IKEA furniture assembly
- `recre` - self-sustaining system
- `pomme` - complex configuration with apples and pies
- `inception` - configuration with nested processes (hours and seconds)

## Output Files

The program creates .log files with execution results in the `resources/` folder in format:

```
<cycle>:<process_name>
```

These files can be used for verification with `krpsim_verif.js`.

## Implementation Features

### Beautiful Output

The program provides detailed and structured output:

- 🔍 Configuration file analysis
- 🚀 Process execution plan
- 📊 Final results
- ✅ Verification results

### Universality

- Code contains no hardcoded processes or resources
- All processes and resources are read from configuration files
- Supports any process and resource names

### Algorithm

Uses a hybrid approach:

- Genetic algorithm for optimization
- Reverse planning (backtracking)
- Greedy/random process selection
- Discrete event simulation

## TypeScript Version Advantages

- **Strong typing** - all interfaces and types are defined
- **Better performance** - compiles to optimized JavaScript
- **Modern syntax** - ES2020+ capabilities
- **Easier maintenance** - TypeScript helps avoid errors at compile time
- **Better IDE support** - autocomplete and type checking
- **Convenient npm scripts** - for building, cleaning and running
