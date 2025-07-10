# Production Chain Simulator

Simulator for optimizing and analyzing production process chains with resource constraints.

## Overview

This project simulates the execution of production processes with limited resources and dependencies. It helps analyze and optimize the order and timing of process execution to achieve goals such as minimizing total time or maximizing output.

## Features

- Reads configuration files describing initial stocks and processes
- Simulates process execution with resource consumption, production, and delays
- Supports optimization by time or by specific resource
- Outputs a trace log suitable for verification
- Includes a verification tool to check the correctness of simulation traces

## Input File Format

- Lines starting with `#` are comments
- Initial stocks: `<stock_name>:<quantity>`
- Process: `<name>:(<need>:<qty>[;<need>:<qty>[...]]):(<result>:<qty>[;<result>:<qty>[...]]):<delay>`
- Optimization goal: `optimize:(time|<stock_name>[;...])`

**Example:**

```
# Example configuration
money:10
material:5
purchase:(money:5):(material:2):3
produce:(material:1):(product:1):2
deliver:(product:1):(client:1):1
optimize:(time;client)
```

## Output Format

- Each executed process: `<cycle>:<process_name>`
- Final stocks summary

**Example:**

```
0:purchase
3:produce
5:deliver
Stock :
client => 1
product => 0
material => 1
money => 5
```

## Usage

### 1. Run the simulator

```
node krpsim.js <config_file> <max_delay>
```

- `<config_file>`: Path to the configuration file
- `<max_delay>`: Maximum simulation time (integer)

### 2. Run the verifier

```
node krpsim_verif.js <config_file> <trace_file>
```

- `<trace_file>`: Path to the simulation trace output

## Project Structure

- `krpsim.js` — main simulator
- `krpsim_verif.js` — trace verifier
- `config/` — example configuration files
- `test/` — test scripts and sample outputs

## Requirements

- Node.js (v14+ recommended)
- No external dependencies required

## License

MIT
