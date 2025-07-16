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
- Process chain verification
- Detailed execution logs

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Running the Simulator

```bash
# Basic usage
npm start -- <config_file> <max_delay>

# Example
npm start -- resources/simple 1000
```

### Running the Verifier

```bash
# Basic usage
npm run verif -- <config_file> <trace_file>

# Example
npm run verif -- resources/simple output.txt
```

### Running Tests

```bash
# Run all test cases
npm run test:all

# Run simple test cases
npm run test:simple
```

## Configuration File Format

The configuration file uses a simple text format:

```
# Comments start with #

# Initial stocks
stock_name:quantity

# Process definitions
process_name:(need1:qty1;need2:qty2):(result1:qty1;result2:qty2):delay

# Optimization goals
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

## Implementation Details

### Core Components

1. Parser (`src/parser.ts`)

   - Parses configuration files
   - Validates process definitions and dependencies
   - Ensures resource consistency

2. Simulator (`src/simulator.ts`)

   - Manages process execution and resource allocation
   - Implements optimization strategies
   - Handles parallel process execution
   - Tracks resource dependencies

3. Output (`src/output.ts`)
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

The verifier (`krpsim_verif`) ensures that:

- All resource constraints are respected
- Process dependencies are correctly handled
- Final resource states are valid
- Execution trace is consistent

## Examples

1. Simple Chain

   - Linear process execution
   - Basic resource management
   - Example: `resources/simple`

2. Parallel Processes

   - Multiple concurrent processes
   - Resource sharing
   - Example: `resources/ikea`

3. Complex Dependencies
   - Multi-step processes
   - Resource reuse
   - Example: `resources/steak`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details
