# KRPSIM Algorithm Summary

## Quick Reference for Project Defense

### What Algorithm is Used?

**Hybrid Algorithm**: Greedy + Deterministic Planning + Genetic Algorithm Elements

### Key Components

#### 1. Core Algorithm (`MainWalk`)

- **Planning Phase**: Backward chaining from target resource
- **Execution Phase**: Event-driven scheduling with resource management
- **Selection Strategy**: Adaptive based on scenario complexity

#### 2. Meta-Optimization (`krpsim.ts`)

- **Multiple Attempts**: Up to 1000 different solutions
- **Selection Criteria**: Efficiency, sustainability, resource usage
- **Termination**: Time limit or generation limit

### Algorithm Flow

```
1. Parse Configuration → 2. Plan Resource Dependencies → 3. Schedule Execution → 4. Evaluate Solution
                                                                    ↓
5. Repeat (up to 1000 times) → 6. Select Best Solution → 7. Execute Final Plan
```

### Key Features

#### Decision Making

- **Simple Scenarios**: Random process selection
- **Complex Scenarios**: Deterministic efficiency-based selection
- **Resource Management**: Use existing vs. produce new (10% random chance)

#### Optimization Criteria

1. **Primary**: Resource production per time unit
2. **Secondary**: System sustainability (self-sustaining)
3. **Tertiary**: Resource utilization efficiency

### Complexity

- **Time**: O(g × n × m × c) where g=generations, n=processes, m=resources, c=cycles
- **Space**: O(c × n + m)

### Why This Approach?

#### Advantages

- ✅ **Fast Execution**: Greedy approach for immediate decisions
- ✅ **Global Optimization**: Multiple attempts escape local optima
- ✅ **Adaptive**: Different strategies for different scenarios
- ✅ **Practical**: Handles real-world constraints and edge cases

#### vs. Pure Genetic Algorithm

- **Similar**: Multiple solution attempts, fitness-based selection
- **Different**: No crossover/mutation, simpler implementation
- **Better**: Faster convergence, more predictable results

#### vs. Pure Greedy Algorithm

- **Similar**: Local optimization, immediate decision making
- **Different**: Multiple attempts, global optimization wrapper
- **Better**: Better solution quality, escape from local optima

### Code Examples

#### Process Selection

```typescript
// Deterministic for complex scenarios
if (this.isComplexScenario()) {
  // Choose process with best efficiency (output/delay)
  const score = (p.result[target] || 0) / Math.max(1, p.delay);
}

// Random for simple scenarios
else {
  chosenProcess =
    possibleProcessList[Math.floor(Math.random() * possibleProcessList.length)];
}
```

#### Fitness Evaluation

```typescript
// Score = amount of target resource / total time taken
this.score =
  this.created / this.goodInstructions[this.goodInstructions.length - 1].cycle;
```

#### Meta-Optimization

```typescript
// Try multiple optimization attempts
for (let i = 0; i < this.maxGenerations - 1; i++) {
  const newMainWalk = new MainWalk(/* parameters */);
  // Keep the best solution based on multiple criteria
  if (newMainWalk.score >= mainWalkInstance.score) {
    mainWalkInstance = newMainWalk;
  }
}
```

### Defense Points

#### Technical Strengths

1. **Hybrid Design**: Combines best of multiple algorithmic approaches
2. **Scenario Awareness**: Adapts strategy based on problem complexity
3. **Resource Efficiency**: Minimizes waste through intelligent planning
4. **Time Management**: Respects user-defined constraints

#### Practical Benefits

1. **Fast Execution**: Suitable for real-time planning
2. **Good Solutions**: Multiple attempts ensure quality results
3. **Robust**: Handles edge cases gracefully
4. **Scalable**: Works for various problem sizes

#### Innovation

- **Adaptive Strategy Selection**: Different approaches for different scenarios
- **Multi-Criteria Optimization**: Balances efficiency, sustainability, and resource usage
- **Hybrid Meta-Heuristic**: Combines local and global optimization principles

### Common Questions & Answers

**Q: Why not use pure genetic algorithm?**
A: Pure GA would be slower and more complex. Our hybrid approach provides better efficiency while maintaining solution quality.

**Q: How do you handle complex resource dependencies?**
A: Through backward chaining and dependency closure analysis, ensuring all required resources are identified and planned.

**Q: What makes this algorithm efficient?**
A: Greedy local decisions combined with global optimization through multiple attempts, providing fast convergence to good solutions.

**Q: How do you ensure solution quality?**
A: Multiple criteria evaluation (efficiency, sustainability, resource usage) and up to 1000 solution attempts to find the best result.
