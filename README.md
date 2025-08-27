# Kinetic Resource Planning Simulator

TypeScript implementation of the Kinetic Resource Planning Simulator (krpsim) for Ecole42 project.

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

Using npm script (recommended):

```bash
npm run krpsim <configuration_file> <max_time>
```

Direct execution:

```bash
node dist/krpsim.js <configuration_file> <max_time>
```

Development mode:

```bash
npm run dev resources/simple 10
```

Examples:

Simple configuration:

```bash
npm run krpsim resources/simple 10
```

Steak configuration:

```bash
npm run krpsim resources/steak 30
```

IKEA configuration:

```bash
npm run krpsim resources/ikea 50
```

Self-sustaining configuration:

```bash
npm run krpsim resources/recre 100
```

Apple configuration:

```bash
npm run krpsim resources/pomme 1000
```

Nested processes configuration:

```bash
npm run krpsim resources/inception 100
```

### krpsim_verif Verification Program

Using npm script:

```bash
npm run krpsim_verif resources/simple resources/simple.log
```

Or directly:

```bash
node dist/krpsim_verif.js resources/simple resources/simple.log
```

Examples:

Verify simple configuration:

```bash
npm run krpsim_verif resources/simple resources/simple.log
```

Verify apple configuration:

```bash
npm run krpsim_verif resources/pomme resources/pomme.log
```

## Command Line Parameters

### krpsim.js

- `file` - configuration file (required)
- `delay` - maximum execution time in seconds (required)
- `-c, --cycle` - maximum number of cycles (default: 10000)
- `-g, --generations` - maximum number of generations for genetic algorithm (default: 1000)
- `-i, --instructions` - maximum number of instructions allowed during process generation (default: 10000)
- `-t, --table` - show detailed generation score analysis table
- `--help` - show help information
- `--version` - show version information

### krpsim_verif.js

- `file` - configuration file (required)
- `trace.log` - result file for verification (required, .log extension)

## NPM Scripts

Build project:

```bash
npm run build
```

Run in development mode:

```bash
npm run dev
```

Run main simulator:

```bash
npm run krpsim
```

Run verifier:

```bash
npm run krpsim_verif
```

Remove build files and .log files:

```bash
npm run clean
```

Remove build files, .log files, node_modules and package-lock.json:

```bash
npm run clean_all
```

## Usage Examples

### Help and Version Information

Show help:

```bash
npm run krpsim -- --help
```

Show help (direct):

```bash
node dist/krpsim.js --help
```

Show version:

```bash
npm run krpsim -- --version
```

Show version (direct):

```bash
node dist/krpsim.js --version
```

### Custom Parameters

Run with custom cycle limit:

```bash
npm run krpsim -- resources/pomme 1000 -c 5000
```

Run with custom generation limit:

```bash
npm run krpsim -- resources/inception 100 -g 2000
```

Run with custom instruction limit:

```bash
npm run krpsim -- resources/steak 30 -i 5000
```

Combine multiple parameters:

```bash
npm run krpsim -- resources/pomme 1000 -c 5000 -g 2000 -i 5000
```

Show generation score analysis:

```bash
npm run krpsim -- resources/pomme 1000 --generations 50 -t
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

Uses a sophisticated hybrid approach:

- **Genetic Algorithm**: Multi-generation optimization with configurable population size
- **Complex Scenario Detection**: Automatic identification of self-referencing processes and resource chains
- **Intelligent Planning**: Two-phase approach with planning and execution phases
- **Resource Chain Building**: Automatic construction of optimal resource production chains
- **Process Prioritization**: Value-based sorting of processes by resource complexity
- **Discrete Event Simulation**: Cycle-based execution with configurable limits

## TypeScript Version Advantages

- **Strong typing** - all interfaces and types are defined
- **Better performance** - compiles to optimized JavaScript
- **Modern syntax** - ES2020+ capabilities
- **Easier maintenance** - TypeScript helps avoid errors at compile time
- **Better IDE support** - autocomplete and type checking
- **Convenient npm scripts** - for building, cleaning and running
