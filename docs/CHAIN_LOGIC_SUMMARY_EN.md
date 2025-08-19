# Process Chain Execution Logic in KRPSIM

## System Overview

KRPSIM (Kinetic Resource Planning Simulator) is a resource planning system that uses genetic algorithms to find optimal process execution sequences for achieving specified goals.

## Core Components

### 1. Data Structures

- **Stock** - resources with quantities
- **Process** - processes with inputs, outputs, and duration
- **Config** - configuration with processes, resources, and optimization goals
- **Individual** - genetic algorithm individual (process sequence)

### 2. Key Functions

#### Process Execution Feasibility Check

```typescript
canStartProcess(process, stocks, config);
```

- Checks availability of all required resources
- Considers critical resources (used by all processes)
- Prevents depletion of critical resources

#### Resource Update After Process

```typescript
updateStocksAfterProcess(process, stocks, config);
```

- Removes consumed resources
- Adds produced resources
- Ensures protection of critical resources

#### Execution Simulation

```typescript
runSimulation(config, processSequence, timeLimit);
```

- Executes process sequence
- Tracks time and resources
- Calculates fitness score with resource accumulation bonuses

## Genetic Algorithm Logic

### 1. Smart Individual Creation

The system uses four strategies for creating initial individuals:

#### Strategy 1: Focus on High-Priority Processes (25% of cases)

- Selects processes with highest priority
- Considers critical resource conservation
- Prefers processes that don't deplete critical resources

#### Strategy 2: Exploration of Different Process Types (25% of cases)

- Alternates different process types (by name prefix)
- Ensures population diversity
- Manages resources between process types

#### Strategy 3: Random Exploration with Priority Bias (25% of cases)

- Combines randomness with priorities
- Preserves critical resources
- Ensures exploration of solution space

#### Strategy 4: Hierarchical Planning (25% of cases)

- **Phase 1:** Processes with very high value (>10000 goal units)
- **Phase 2:** Direct input producers for Phase 1 processes
- **Phase 3:** Input producers for Phase 2 processes
- Plans resource accumulation for chain completion
- Blocks selling of intermediate products until chains are ready

### 2. Process Priority Calculation

```typescript
buildProcessPriority(processes, optimizeGoals);
```

1. **Resource Dependency Graph Construction**

   - Identifies producers and consumers of each resource
   - Creates resource relationship map

2. **Process Economic Value Calculation**

   - Calculates profitability of each process
   - Considers input costs and output values
   - Applies bonuses/penalties based on economic value

3. **Process Prioritization**
   - Processes producing goals directly: high priority
   - High-profitability processes: increased priority
   - Other processes: priority based on economic value

### 3. Resource Reserve Planning

```typescript
planReserveTargets(processes, goals, maxDepth);
```

- Calculates target quantities for high-value chains
- Determines number of runs to achieve goals
- Considers process complexity and production scale

### 4. Best Producer Selection

```typescript
chooseBestProducer(producers, resource);
```

- Evaluates producers by output per cycle
- Considers economic value of outputs
- Applies penalty for complexity (many inputs)

### 5. Population Evolution

#### Selection

- Elitism: best individuals are preserved
- Tournament selection for remaining individuals

#### Crossover

- Single-point crossover
- Configurable crossover probability (75-95%)

#### Mutation

- Random changes in sequence
- Configurable mutation probability (8-20%)

## Fitness Function Improvements

### Resource Accumulation Bonuses

```typescript
// Bonus for accumulating resources for high-value chains
chainAccumulationBonus += (currentQuantity / targetQuantity) * 0.5;

// Bonus for producing intermediate products
intermediateProductionBonus += outputValue / 1000;
```

### Inefficiency Penalties

- Penalty for unused time
- Penalty for critical resource depletion
- Penalty for unexecuted processes

## Execution Examples

### Simple Example (simple)

```
Goals: time, client_content
Resources: euro:10
Processes:
- achat_materiel: euro:8 → materiel:1 (10 cycles)
- realisation_produit: materiel:1 → produit:1 (30 cycles)
- livraison: produit:1 → client_content:1 (20 cycles)

Optimal sequence:
0:achat_materiel (euro:10→2, materiel:0→1)
10:realisation_produit (materiel:1→0, produit:0→1)
40:livraison (produit:1→0, client_content:0→1)

Result: client_content: 1, time: 60 cycles
```

### Complex Example (ikea)

```
Goals: time, armoire
Resources: planche:7
Processes:
- do_montant: planche:1 → montant:1 (15 cycles)
- do_fond: planche:2 → fond:1 (20 cycles)
- do_etagere: planche:1 → etagere:1 (10 cycles)
- do_armoire_ikea: montant:2, fond:1, etagere:3 → armoire:1 (30 cycles)

Optimal sequence:
0:do_montant (planche:7→6, montant:0→1)
15:do_etagere (planche:6→5, etagere:0→1)
25:do_etagere (planche:5→4, etagere:1→2)
35:do_etagere (planche:4→3, etagere:2→3)
45:do_fond (planche:3→1, fond:0→1)
65:do_montant (planche:1→0, montant:1→2)
80:do_armoire_ikea (montant:2→0, fond:1→0, etagere:3→0, armoire:0→1)

Result: armoire: 1, time: 110 cycles
```

### Complex Example (pomme)

```
Goals: euro
Resources: four:10, euro:10000
Processes:
- buy_pomme: euro:100 → pomme:700 (200 cycles)
- buy_citron: euro:100 → citron:400 (200 cycles)
- buy_oeuf: euro:100 → oeuf:100 (200 cycles)
- separation_oeuf: oeuf:1 → jaune_oeuf:1, blanc_oeuf:1 (2 cycles)
- do_tarte_pomme: pomme:1, pate_sablee:1 → tarte_pomme:1 (30 cycles)
- do_tarte_citron: citron:1, pate_sablee:1 → tarte_citron:1 (30 cycles)
- do_flan: lait:1, oeuf:1 → flan:1 (20 cycles)
- do_boite: tarte_citron:3, tarte_pomme:7, flan:1, euro:30 → boite:1 (50 cycles)
- vente_boite: boite:100 → euro:55000 (30 cycles)

Hierarchical Planning:
- Phase 1: vente_boite (goal: 55000 euro)
- Phase 2: do_boite (requires tarte_citron, tarte_pomme, flan)
- Phase 3: do_tarte_citron, do_tarte_pomme, do_flan (require basic resources)

Result: Accumulation of intermediate products for boite production
```

## Key Features

### 1. Critical Resource Management

- System identifies resources used by many processes
- Prevents their depletion
- Ensures system stability

### 2. Hierarchical Planning

- Plans high-level goals first
- Details sub-processes and resource accumulation
- Blocks selling until chains are complete

### 3. Economic Optimization

- Calculates process profitability
- Prioritizes high-revenue processes
- Considers value creation chains

### 4. Adaptive Parameters

- Genetic algorithm parameters adjust based on problem complexity
- Number of generations and population size depend on number of processes and resources

### 5. Multiple Strategies

- Different approaches to individual creation ensure diversity
- Strategy combination improves solution quality

### 6. Enhanced Fitness Evaluation

- Considers goal achievement
- Bonuses for accumulating resources for high-value chains
- Bonuses for producing intermediate products
- Penalizes inefficient time usage

## Debug Script Usage

### Economic Analysis

```bash
npm run debug-economic -- resources/pomme
```

Shows:

- Economic value of each process
- Profitability and margins
- Resource chain analysis
- Prioritization recommendations

### Optimal Analysis with Genetic Algorithm

```bash
npm run debug-optimal -- resources/simple 1000
```

Shows:

- Process dependency analysis
- Step-by-step sequence execution
- Detailed resource information
- Solution efficiency analysis

### Main Simulator

```bash
npm run krpsim -- resources/pomme 50000
```

Shows:

- Beautiful output with emojis
- Detailed file and process information
- Genetic algorithm progress
- Final results with resource changes
- Execution logs in separate files for each scenario
