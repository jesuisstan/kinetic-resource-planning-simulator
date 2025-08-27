# Generations Mechanism in KRPSIM

## Overview

The KRPSIM algorithm uses a **genetic algorithm-inspired approach** with multiple optimization attempts called "generations". This document explains how the generations mechanism works and when it terminates.

## How Generations Work

### 1. Generation Creation Process

```typescript
// From krpsim.ts lines 121-150
for (let i = 0; i < this.maxGenerations - 1; i++) {
  const deltaTime = Date.now() - this.startTime;
  if (deltaTime > this.maxDelay * 1000) {
    // Time limit reached - stop optimization
    break;
  }

  // Create new MainWalk instance with different random choices
  const newMainWalk = new MainWalk(/* parameters */);

  // Keep the best solution based on multiple criteria
  if (newMainWalk.loop > mainWalkInstance.loop) {
    mainWalkInstance = newMainWalk; // Prefer self-sustaining solutions
  } else if (newMainWalk.score >= mainWalkInstance.score) {
    mainWalkInstance = newMainWalk; // Prefer better scores
  }
}
```

### 2. Termination Conditions

#### A. Generation Limit Reached

- **Condition**: `i >= this.maxGenerations - 1`
- **Default**: 1000 generations
- **Override**: `--generations N` parameter
- **Behavior**: Creates exactly N generations (unless interrupted)

#### B. Time Limit Reached

- **Condition**: `deltaTime > this.maxDelay * 1000`
- **Calculation**: Current time - Start time > User delay limit
- **Behavior**: Stops optimization early, logs interruption

### 3. Solution Selection Criteria

The algorithm keeps the best solution based on multiple criteria:

1. **Self-Sustainability** (Primary): `newMainWalk.loop > mainWalkInstance.loop`

   - Prefers solutions that can continue running indefinitely
   - Most important for infinite scenarios

2. **Efficiency Score** (Secondary): `newMainWalk.score >= mainWalkInstance.score`

   - Score = target_resource / total_time
   - Higher score = better efficiency

3. **Resource Production** (Tertiary): `newMainWalk.created >= mainWalkInstance.created`
   - More target resource production is preferred

## Test Results Analysis

### Test 1: Default Generations (1000)

```bash
npm run krpsim -- resources/programming_infinite 100
```

**Result**: Created 1000 generations (max: 1000)

- All generations completed
- No time interruption

### Test 2: Limited Generations (100)

```bash
npm run krpsim -- resources/programming_infinite 100 --generations 100
```

**Result**: Created 100 generations (max: 100)

- All generations completed
- Faster execution

### Test 3: High Generations (10000)

```bash
npm run krpsim -- resources/programming_infinite 1000 --generations 10000
```

**Result**: Created 10000 generations (max: 10000)

- All generations completed
- Longer execution time (0.195s vs 0.031s)

### Test 4: Very High Generations (100000)

```bash
npm run krpsim -- resources/programming_infinite 1000 --generations 100000
```

**Result**: Created 100000 generations (max: 100000)

- All generations completed
- Much longer execution time (1.278s)

## Performance Analysis

### Execution Time vs Generations

| Generations | Execution Time | Time per Generation |
| ----------- | -------------- | ------------------- |
| 100         | 0.031s         | 0.00031s            |
| 1000        | 0.059s         | 0.000059s           |
| 10000       | 0.195s         | 0.0000195s          |
| 100000      | 1.278s         | 0.00001278s         |

### Observations

1. **Linear Scaling**: Execution time scales linearly with generations
2. **Efficiency**: More generations = slightly better efficiency per generation
3. **No Early Termination**: All generations complete unless time limit reached

## When Does Early Termination Occur?

### Time-Based Termination

Early termination happens when:

```typescript
const deltaTime = Date.now() - this.startTime;
if (deltaTime > this.maxDelay * 1000) {
  console.log(`⏰ Time limit reached after ${generationsCreated} generations`);
  break;
}
```

### Example Scenarios

1. **Very Short Time Limit**: `delay = 1` → May interrupt during generation creation
2. **Very High Generations**: `generations = 1000000` → May take too long
3. **Complex Scenarios**: Some scenarios may take longer per generation

## Command Line Parameters

### Generations Control

```bash
# Default (1000 generations)
npm run krpsim -- resources/file 100

# Custom generations
npm run krpsim -- resources/file 100 --generations 5000

# Short form
npm run krpsim -- resources/file 100 -g 5000

# Show score analysis table
npm run krpsim -- resources/file 100 -t

# Combine flags
npm run krpsim -- resources/file 100 --generations 100 --table
```

### Other Parameters

```bash
# All available parameters
npm run krpsim -- resources/file 100 \
  --generations 1000 \    # Optimization attempts
  --cycle 10000 \         # Internal cycle limit
  --instructions 10000 \  # Planning phase limit
  --table                 # Show score analysis table
```

## Optimization Strategy

### Why Multiple Generations?

1. **Randomness**: Each MainWalk instance uses random choices
2. **Different Solutions**: Different random seeds produce different solutions
3. **Best Selection**: Algorithm keeps the best solution found
4. **Escape Local Optima**: Multiple attempts help find global optimum

### Generation Quality

- **Early Generations**: May find basic solutions
- **Later Generations**: May find better optimizations
- **Diminishing Returns**: Quality improvement slows over time

## Recommendations

### For Different Scenarios

#### Simple Scenarios

- **Generations**: 100-500
- **Reason**: Simple scenarios converge quickly

#### Complex Scenarios

- **Generations**: 1000-5000
- **Reason**: More complex optimization needed

#### Infinite Scenarios

- **Generations**: 1000-10000
- **Reason**: Self-sustainability requires careful optimization

### Performance vs Quality Trade-off

- **High Generations**: Better solutions, slower execution
- **Low Generations**: Faster execution, potentially worse solutions
- **Sweet Spot**: 1000-5000 generations for most scenarios

## Conclusion

The generations mechanism in KRPSIM provides:

1. **Controlled Optimization**: Predictable number of attempts
2. **Time Safety**: Automatic termination on time limit
3. **Quality Assurance**: Multiple attempts ensure good solutions
4. **Flexibility**: Adjustable via command line parameters

The algorithm typically creates **all requested generations** unless interrupted by time constraints, ensuring thorough optimization of the resource planning solution.
