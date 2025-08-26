# Infinite Loop Scenarios in KRPSIM

## Overview

This document describes the infinite loop scenarios created for testing the KRPSIM algorithm's ability to handle self-sustaining systems.

## Created Scenarios

### 1. `infinite_perfect` - Perfect Self-Sustaining System

**File**: `resources/infinite_perfect`

#### Configuration

```
Initial Stock:
- a: 10
- b: 5
- c: 3

Processes:
- process1: (a:1) → (b:2) : 10 cycles
- process2: (b:1) → (c:2) : 12 cycles
- process3: (c:1) → (a:2) : 8 cycles

Optimization Target: a
```

#### How It Works

This creates a perfect infinite loop: **a → b → c → a**

- Each process consumes 1 unit and produces 2 units
- The system can run indefinitely without resource depletion
- Resources grow exponentially over time

#### Test Results

- **Time Limit**: 1000 cycles
- **Actual Runtime**: 997 cycles
- **Final Resources**: a=93, b=88, c=86
- **Status**: ✅ **SUCCESS** - Runs almost to time limit

### 2. `infinite_factory` - Factory Production System

**File**: `resources/infinite_factory`

#### Configuration

```
Initial Stock:
- raw_material: 20
- energy: 5
- machine: 2
- product: 0

Processes:
- extract_material: (energy:1) → (raw_material:3) : 12 cycles
- produce_energy: (raw_material:1, machine:1) → (energy:2) : 15 cycles
- build_machine: (raw_material:2, energy:1) → (machine:1) : 25 cycles
- manufacture_product: (raw_material:2, machine:1, energy:1) → (product:1) : 30 cycles
- recycle_product: (product:1) → (raw_material:1) : 20 cycles

Optimization Target: product
```

#### How It Works

This simulates a factory with:

- **Energy Production Loop**: raw_material + machine → energy
- **Material Extraction**: energy → raw_material
- **Machine Building**: raw_material + energy → machine
- **Product Manufacturing**: raw_material + machine + energy → product
- **Recycling**: product → raw_material

#### Test Results

- **Time Limit**: 500 cycles
- **Actual Runtime**: 61 cycles
- **Final Resources**: energy=1, machine=0, product=2, raw_material=23
- **Status**: ❌ **FAILS** - Machines run out, system stops

### 3. `infinite_complex` - Ecosystem Simulation

**File**: `resources/infinite_complex`

#### Configuration

```
Initial Stock:
- water: 20
- seeds: 10
- soil: 15
- sunlight: 5

Processes:
- Plant growth cycle: seeds + soil + water → plant → fruit + seeds
- Water cycle: sunlight → water → vapor → water
- Soil cycle: food → soil → rich_soil
- Sunlight cycle: plant + water → sunlight + heat
- Seed cycle: seeds + water + soil → sprout → plant + seeds

Optimization Target: food
```

#### How It Works

This simulates a complete ecosystem with:

- **Plant Growth**: Seeds → Plants → Fruits → Seeds
- **Water Cycle**: Evaporation and condensation
- **Nutrient Cycle**: Food decomposition and soil enrichment
- **Energy Flow**: Sunlight absorption and heat generation

## Algorithm Behavior Analysis

### Why Some Systems Stop Early

#### 1. Resource Depletion

- **Problem**: Critical resources (like machines) get consumed faster than produced
- **Solution**: Ensure each resource has a production process that creates more than consumed

#### 2. Process Dependencies

- **Problem**: Complex dependency chains can create bottlenecks
- **Solution**: Design balanced loops where each resource has multiple production paths

#### 3. Timing Issues

- **Problem**: Process delays can cause temporary resource shortages
- **Solution**: Maintain sufficient initial stock and use processes with appropriate timing

### Successful Infinite Loop Characteristics

#### 1. Balanced Production

```
Good: process1: (a:1) → (b:2)  // Produces more than consumes
Bad:  process1: (a:2) → (b:1)  // Consumes more than produces
```

#### 2. Circular Dependencies

```
a → b → c → a  // Perfect loop
a → b → a      // Simple loop
```

#### 3. Multiple Production Paths

```
a → b → a
a → c → a      // Backup paths prevent bottlenecks
```

## Testing Infinite Scenarios

### Command Usage

```bash
# Test with different time limits
npm run krpsim -- resources/infinite_perfect 1000
npm run krpsim -- resources/infinite_perfect 2000
npm run krpsim -- resources/infinite_perfect 5000

# Compare different scenarios
npm run krpsim -- resources/infinite_factory 500
npm run krpsim -- resources/infinite_complex 500
```

### Success Criteria

1. **Runtime**: Should run close to the time limit
2. **Resource Growth**: Resources should increase over time
3. **No Depletion**: No critical resource should reach zero
4. **Stable Loop**: Process execution should be consistent

### Performance Metrics

- **Efficiency**: Resource production per cycle
- **Stability**: Consistency of process execution
- **Scalability**: Performance with longer time limits
- **Robustness**: Ability to handle resource fluctuations

## Creating Your Own Infinite Scenarios

### Step 1: Design the Loop

1. Identify core resources needed
2. Create circular dependencies
3. Ensure positive net production

### Step 2: Balance the System

1. Calculate resource consumption vs production
2. Adjust process ratios if needed
3. Add backup production paths

### Step 3: Test and Iterate

1. Start with small time limits
2. Monitor resource levels
3. Adjust process parameters
4. Scale up time limits

### Example Template

```
# stock
resource1:10
resource2:5

# processes
process1:(resource1:1):(resource2:2):10
process2:(resource2:1):(resource1:2):12

# optimize
optimize:(resource1)
```

## Conclusion

The `infinite_perfect` scenario demonstrates a successful infinite loop that can run continuously, while `infinite_factory` shows the challenges of maintaining complex production systems. The key to creating successful infinite scenarios is ensuring balanced resource production and avoiding critical resource depletion.
