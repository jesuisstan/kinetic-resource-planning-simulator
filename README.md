# Kinetic Resource Planning Simulator

A TypeScript implementation of a resource planning and optimization system that simulates and optimizes process chains based on resource constraints.

## Overview

The simulator takes a configuration file describing:

- Initial resource stocks
- Available processes with their inputs, outputs, and delays
- Optimization goals (time and/or specific resources)

It then produces an optimized execution plan that maximizes the specified goals while respecting resource constraints.

## Features

- Parallel process execution when resources allow
- Resource dependency tracking and optimization
- Time and resource optimization
- Comprehensive input validation
- Process chain verification
- Detailed execution logs

## Installation

Install dependencies:

```bash
npm install
```

Build the project:

```bash
npm run build
```

## Usage

### Running the Simulator

Basic usage:

```bash
npm run krpsim -- <config_file> <max_delay>
```

Example:

```bash
npm run krpsim -- resources/simple 1000
```

### Running the Verifier

Basic usage:

```bash
npm run verify -- <config_file> <trace_file>
```

Example:

```bash
npm run verify -- resources/simple output.txt
```

### Additional Scripts

Clean build artifacts and logs:

```bash
npm run clean
```

Complete rebuild (clean + reinstall + build):

```bash
npm run rebuild
```

Run all test cases:

```bash
npm run test:all
```

Run simple test cases:

```bash
npm run test:simple
```

## Configuration File Format

The configuration file uses a simple text format:

```
# Comments start with #

# Initial stocks (required)
stock_name:quantity

# Process definitions (at least one required)
process_name:(need1:qty1;need2:qty2):(result1:qty1;result2:qty2):delay

# Optimization goals (required)
optimize:(time|stock1;time|stock2;...)
```

Example:

```
# Initial stock
euro:10

# Processes
equipment_purchase:(euro:8):(equipment:1):10
product_creation:(equipment:1):(product:1):30
delivery:(product:1):(happy_client:1):20

# Optimize for time and happy clients
optimize:(time;happy_client)
```

## Input Validation

The parser performs comprehensive validation of input files:

1. Stock Validation

   - No duplicate stock names
   - No negative initial quantities
   - At least one stock must be defined

2. Process Validation

   - Unique process names
   - All required resources must exist
   - Valid process delays
   - At least one process must be defined

3. Optimization Validation
   - All optimization targets must exist
   - Valid optimization format

## Implementation Details

### Core Components

1. Parser (`src/parser.ts`)

   - Parses configuration files
   - Performs comprehensive input validation
   - Ensures resource consistency
   - Validates process dependencies

2. Simulator (`src/krpsim.ts`)

   - Manages process execution and resource allocation
   - Implements optimization strategies
   - Handles parallel process execution
   - Tracks resource dependencies

3. Output Management
   - Formats simulation results
   - Generates execution traces
   - Provides detailed logs

### Optimization Strategy

The simulator uses several strategies to optimize process execution:

1. Resource Allocation

   - Calculates initial resource distribution
   - Tracks resource dependencies
   - Prioritizes critical resources

2. Process Scheduling

   - Evaluates process priorities based on:
     - Direct contribution to optimization goals
     - Resource scarcity
     - Process dependencies
     - Time efficiency

3. Parallel Execution
   - Identifies independent processes
   - Maximizes resource utilization
   - Respects process dependencies

### Verification

The verification process ensures:

- All resource constraints are respected
- Process dependencies are correctly handled
- Final resource states are valid
- Execution trace is consistent
- Time calculations include process durations

## Test Cases

### Valid Scenarios

1. Simple Chain (`resources/simple`)

   - Linear process execution
   - Basic resource management

2. Parallel Processes (`resources/ikea`)

   - Multiple concurrent processes
   - Resource sharing

3. Complex Dependencies (`resources/steak`)
   - Multi-step processes
   - Resource reuse

### Invalid Scenarios

1. Missing Components

   - No initial stocks
   - No processes defined

2. Validation Errors
   - Duplicate process names
   - Duplicate stock names
   - Negative initial stocks
   - Unknown resource requirements
   - Invalid optimization targets

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details
