# KRPSIM Algorithm Description

## Hybrid Optimization Approach for Resource Planning

### Overview

The KRPSIM (Kinetic Resource Planning Simulator) implements a **hybrid optimization algorithm** that combines elements of greedy algorithms, deterministic planning, and genetic algorithm principles. This document explains the algorithmic approach used in the project.

### Algorithm Classification

**Primary Algorithm**: Greedy Algorithm with Deterministic Planning  
**Meta-Heuristic**: Randomized Local Search with Genetic Algorithm Elements  
**Complexity**: O(n × m × g) where n=processes, m=resources, g=generations

---

## Core Algorithm Components

### 1. Main Optimization Engine (`MainWalk` class)

The core algorithm operates in three distinct phases:

#### Phase 1: Planning Phase (`retrieveInstructions`)

```typescript
// From MainWalk.ts lines 320-380
private retrieveInstructions(processList: ProcessList): void {
  // Start by planning to produce the target resource
  this.selectProcess(this.optimizationTarget, -1, processList);

  // Iterative planning with pruning for complex scenarios
  while (Object.keys(this.requiredStock).length > 0) {
    const requiredName = Object.keys(this.requiredStock)[0];
    if (!this.selectProcess(requiredName, this.requiredStock[requiredName], processList)) {
      break;
    }
  }
}
```

**Algorithm**: Backward Chaining with Resource Dependency Resolution

- **Strategy**: Start from target resource and work backwards
- **Approach**: Recursively identify required inputs for each process
- **Optimization**: Prune negative requirements to prevent infinite loops

#### Phase 2: Execution Scheduling (`finalizeProcess`)

```typescript
// From MainWalk.ts lines 105-160
private finalizeProcess(maxCycle: number, initialStock: Stock): GoodInstruction[] {
  // Get initial processes that can run immediately
  const possibleProcesses = this.finalizePossibleProcesses(initialStock, this.instructionDict);

  // Main execution loop: process completions and start new processes
  while (Object.keys(todoList).length > 0 && currentCycle <= maxCycle) {
    currentCycle = Math.min(...Object.keys(todoList).map(Number));
    // Complete finished processes and add their outputs to stock
    // Find new processes that can now run with updated resources
  }
}
```

**Algorithm**: Event-Driven Scheduling with Resource Management

- **Strategy**: Time-based process scheduling
- **Approach**: Maintain todo list of process completion times
- **Optimization**: Greedy selection of available processes at each cycle

#### Phase 3: Process Selection Strategy (`finalizePossibleProcesses`)

The algorithm uses different strategies based on scenario complexity:

##### Strategy 1: Complex Scenario Handling

```typescript
// From MainWalk.ts lines 170-220
if (this.isComplexScenario()) {
  // Build closure of needed resources
  const needClosure = new Set<string>();
  // Expand needs closure to find all required resources

  // Run fast conversion processes first (shortest delays)
  const conversions = Object.entries(this.processList)
    .filter(([name, proc]) =>
      Object.keys(proc.result).some((r) => needClosure.has(r))
    )
    .sort((a, b) => a[1].delay - b[1].delay); // Sort by delay (fastest first)
}
```

**Algorithm**: Dependency Closure with Greedy Selection

- **Strategy**: Build resource dependency graph
- **Approach**: Prioritize fast conversion processes
- **Optimization**: Minimize total execution time

##### Strategy 2: Deterministic Process Selection

```typescript
// From MainWalk.ts lines 225-240
for (const key of Object.keys(instructionDict).sort((a, b) =>
  b.localeCompare(a)
)) {
  let count = instructionDict[key];
  while (count > 0 && this.finalizeProcessIfPossible(key)) {
    processesCycle.push(key);
    instructionDict[key]--;
    count--;
  }
}
```

**Algorithm**: Priority-Based Execution

- **Strategy**: Execute planned processes in priority order
- **Approach**: Respect instruction dictionary from planning phase
- **Optimization**: Maximize planned process execution

### 2. Meta-Heuristic Optimization (`krpsim.ts`)

The outer optimization layer implements genetic algorithm principles:

```typescript
// From krpsim.ts lines 115-164
// Try multiple optimization attempts (genetic algorithm approach)
for (let i = 0; i < this.maxGenerations - 1; i++) {
  // Create new MainWalk instance (different random choices lead to different solutions)
  const newMainWalk = new MainWalk(/* parameters */);

  // Keep the best solution based on multiple criteria
  if (newMainWalk.loop > mainWalkInstance.loop) {
    // Prefer solutions that can continue running (self-sustaining)
    mainWalkInstance = newMainWalk;
  } else if (
    newMainWalk.loop === mainWalkInstance.loop &&
    newMainWalk.score >= mainWalkInstance.score
  ) {
    // Better score or same score with more resource production
    mainWalkInstance = newMainWalk;
  }
}
```

**Algorithm**: Randomized Local Search with Elitism

- **Population Size**: 1 (elitist approach)
- **Selection**: Tournament selection with multiple criteria
- **Variation**: Random initialization of MainWalk instances
- **Termination**: Time limit or generation limit

---

## Decision-Making Mechanisms

### 1. Process Selection Algorithm (`selectProcess`)

```typescript
// From MainWalk.ts lines 390-450
private selectProcess(requiredName: string, requiredQuantity: number, processList: ProcessList): boolean {
  // Decide whether to use existing stock or produce more
  if (currentStockRequired === 0 || requiredQuantity === -1 ||
      Math.random() * 10 >= 9 || // 10% chance to produce even if we have stock
      this.maxInstructions <= 0) {

    // Choose the best process based on scenario type
    if (this.isComplexScenario()) {
      // Deterministic choice for optimal results
      if (requiredName === this.optimizationTarget) {
        // Choose process with best efficiency (output/delay)
        let best = -Infinity;
        for (const p of possibleProcessList) {
          const score = (p.result[this.optimizationTarget] || 0) / Math.max(1, p.delay);
          if (score > best) {
            best = score;
            chosenProcess = p;
          }
        }
      }
    } else {
      // Random choice for simple scenarios
      chosenProcess = possibleProcessList[Math.floor(Math.random() * possibleProcessList.length)];
    }
  }
}
```

**Decision Criteria**:

1. **Resource Availability**: Use existing stock vs. produce new
2. **Scenario Complexity**: Deterministic vs. random selection
3. **Efficiency Optimization**: Output/delay ratio for target resources
4. **Process Simplicity**: Fewer inputs preferred for non-target resources

### 2. Fitness Function

```typescript
// From MainWalk.ts lines 70-90
private calculateScore(initialStock: Stock): void {
  this.created = this.updatedStock[this.optimizationTarget] || 0;

  if (!this.goodInstructions.length || this.goodInstructions[this.goodInstructions.length - 1].cycle === 0) {
    this.score = 0;
  } else {
    // Score = amount of target resource / total time taken
    this.score = this.created / this.goodInstructions[this.goodInstructions.length - 1].cycle;
  }

  // Check if system can continue running (has resources)
  this.loop = /* sustainability check */;
}
```

**Fitness Criteria**:

1. **Primary**: Resource production per time unit (efficiency)
2. **Secondary**: System sustainability (self-sustaining capability)
3. **Tertiary**: Resource utilization (minimize waste)

---

## Algorithmic Complexity Analysis

### Time Complexity

- **Planning Phase**: O(n × m) where n=processes, m=resources
- **Execution Phase**: O(c × n) where c=cycles, n=processes
- **Meta-Optimization**: O(g × (planning + execution))
- **Overall**: O(g × n × m × c)

### Space Complexity

- **Resource Tracking**: O(m) for stock management
- **Process Scheduling**: O(c × n) for todo list
- **Instruction Planning**: O(n) for instruction dictionary
- **Overall**: O(c × n + m)

---

## Algorithm Advantages

### 1. Hybrid Approach Benefits

- **Deterministic Planning**: Guarantees resource dependency resolution
- **Greedy Execution**: Fast and efficient process scheduling
- **Randomized Search**: Escapes local optima through multiple attempts

### 2. Scenario Adaptability

- **Simple Scenarios**: Fast random selection
- **Complex Scenarios**: Sophisticated dependency analysis
- **Mixed Scenarios**: Adaptive strategy selection

### 3. Optimization Features

- **Multi-Criteria Selection**: Balances efficiency, sustainability, and resource usage
- **Time-Aware Scheduling**: Respects user-defined time limits
- **Resource Conservation**: Minimizes waste through intelligent planning

---

## Comparison with Classical Algorithms

### vs. Pure Genetic Algorithm

- **Similarities**: Multiple solution attempts, fitness-based selection
- **Differences**: No crossover, no mutation, no population management
- **Advantage**: Faster convergence, simpler implementation

### vs. Pure Greedy Algorithm

- **Similarities**: Local optimization, immediate decision making
- **Differences**: Multiple attempts, global optimization wrapper
- **Advantage**: Better solution quality, escape from local optima

### vs. Dynamic Programming

- **Similarities**: Resource dependency resolution
- **Differences**: No optimal substructure guarantee, heuristic approach
- **Advantage**: Handles complex scenarios, practical implementation

---

## Implementation Notes

### Key Design Decisions

1. **Separation of Concerns**: Planning vs. execution phases
2. **Scenario Awareness**: Different strategies for different problem types
3. **Resource Management**: Efficient stock tracking and updates
4. **Time Management**: Respect for user-defined constraints

### Performance Optimizations

1. **Early Termination**: Stop when time limit exceeded
2. **Pruning**: Remove negative resource requirements
3. **Caching**: Reuse process lists and stock states
4. **Efficient Data Structures**: Maps and sets for fast lookups

### Error Handling

1. **Resource Validation**: Check availability before execution
2. **Cycle Limits**: Prevent infinite loops
3. **Process Validation**: Ensure process requirements are met
4. **Graceful Degradation**: Fallback strategies for edge cases

---

## Conclusion

The KRPSIM algorithm represents a sophisticated hybrid approach that combines the efficiency of greedy algorithms with the global optimization capabilities of genetic algorithm principles. This design choice provides:

1. **Practical Efficiency**: Fast execution suitable for real-time planning
2. **Solution Quality**: Multiple attempts ensure good solution discovery
3. **Adaptability**: Different strategies for different problem complexities
4. **Robustness**: Handles edge cases and constraint violations gracefully

This hybrid approach makes KRPSIM particularly suitable for resource planning problems where both speed and solution quality are important considerations.
