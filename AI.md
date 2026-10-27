# FixFlow

## Description
FixFlow is a commercial electronics repair operations platform built with Node.js and Express that manages device intake, diagnostics, inventory reservations, task execution, and quality control. The application entry point is `server.js`, which binds to `0.0.0.0:3000` and serves a single-page interface alongside REST endpoints. Core business workflows are orchestrated by `services/jobService.js` for repair state transitions and pricing estimates, `services/inventoryService.js` for parts allocation and stock tracking, `services/technicianService.js` for workload capacity and skill matching, `services/taskService.js` for dependency validation, and `services/repairDependencyEngine.js` for heuristic queue prioritization. Data persistence is handled by `repositories/db.js`, which atomically synchronizes application state with `data/fixflow-db.json` and initializes from `data/seed.json`.

## Repository Structure
```
.
├── challenge.json                       # Platform runtime specification and metadata
├── package.json                         # Node.js project manifest and dependency definitions
├── server.js                            # Application entry point and Express HTTP server
├── data/
│   ├── fixflow-db.json                  # Active JSON application persistence store
│   └── seed.json                        # Default database seed fixtures
├── repositories/
│   └── db.js                            # Atomic file persistence repository
├── routes/
│   ├── engine.js                        # Repair Dependency Engine recommendation routes
│   ├── inventory.js                     # Spare-parts inventory and stock adjustment routes
│   ├── jobs.js                          # Repair job lifecycle, estimate, and task routes
│   ├── reports.js                       # Operational metrics and reporting routes
│   ├── state.js                         # State reset and database inspection routes
│   └── technicians.js                   # Technician skill and capacity routes
├── services/
│   ├── inventoryService.js              # Stock reservations, consumption, and adjustments
│   ├── jobService.js                    # Job state machine, pricing, tasks, and QA workflows
│   ├── repairDependencyEngine.js        # Urgency scoring and operational constraint engine
│   ├── taskService.js                   # DAG prerequisite evaluation and cycle detection
│   └── technicianService.js             # Skill matching and technician workload tracking
└── public/
    ├── index.html                       # Single-page dashboard interface
    ├── css/
    │   └── app.css                      # Industrial workshop operations design styles
    └── js/
        └── app.js                       # Frontend client application controller
```

## Bugs and Bug Locations

1. Queue Urgency Calculation
- Bug location: `services/repairDependencyEngine.js`, within `evaluate()`
- How to observe it: Run `node tests/runner.js` to observe `test_queue_urgency_calculation` failing, or inspect the engine recommendations where a job due in 72 hours scores higher than an urgent job due in 2 hours with identical priority.
- Failure: Urgency scoring multiplies `hoursRemaining * 10` directly, which increases the score as deadlines move farther into the future, improperly penalizing imminent and overdue repairs.
- Expected: Urgency score must be inversely proportional to time remaining (`hoursRemaining <= 0 ? 150 : Math.max(0, Math.round(100 - hoursRemaining))`), ranking imminent and overdue deadlines higher.

2. Task Dependency Graph Resolution
- Bug location: `services/taskService.js`, within `arePrerequisitesSatisfied(task, allTasks)`
- How to observe it: Run `node tests/runner.js` to observe `test_task_dependency_graph_resolution` failing, or evaluate a task with multiple prerequisites where only one prerequisite is completed.
- Failure: The method evaluates prerequisites using `task.prerequisites.some()` instead of `every()`, prematurely clearing a task when any single prerequisite is satisfied.
- Expected: The method must require all prerequisites to have `status === 'completed'` before returning `true` by using `task.prerequisites.every()`.

3. Inventory Reservation Reconciliation
- Bug location: `services/inventoryService.js`, within `consumeReservedPart(partId, quantity)`
- How to observe it: Run `node tests/runner.js` to observe `test_inventory_reservation_reconciliation` failing, or complete a repair task that consumes a reserved part and inspect `part.reserved` in inventory.
- Failure: The function decrements physical `onHand` stock but fails to decrement `reserved`, causing reserved stock to remain permanently locked and artificially depleting available inventory.
- Expected: Consuming a reserved part must decrement both `onHand` and `reserved` stock (`part.reserved = Math.max(0, part.reserved - qty)`).

4. Job Cancellation Stock Release
- Bug location: `services/jobService.js`, within `cancelJob(jobId, reason, actor)`
- How to observe it: Run `node tests/runner.js` to observe `test_job_cancellation_stock_release` failing, or cancel a job in `waiting_for_parts` or `ready_to_repair` with allocated parts.
- Failure: The cancellation handler checks `if (job.status === 'in_progress')` before releasing parts, leaving allocated stock permanently reserved when cancelling jobs in pre-repair states.
- Expected: Cancelling a job from any active pre-completion status (`awaiting_approval`, `waiting_for_parts`, `ready_to_repair`, `in_progress`, `quality_check`) must release all reserved parts back to available inventory.

5. Repair Cost Estimation
- Bug location: `services/jobService.js`, within `calculateEstimate({ diagnosisFee, laborHours, laborRate, partsCost, taxRate })`
- How to observe it: Run `node tests/runner.js` to observe `test_repair_cost_estimation` failing, or compute an estimate with $40 diagnosis fee, $160 labor, $150 parts, and 10% tax; tax calculates as $15.00 instead of $35.00.
- Failure: Tax is calculated exclusively on `partsCost` rather than the total repair subtotal (diagnosis fee + labor cost + parts cost).
- Expected: Tax must be calculated on the entire repair subtotal (`Math.round((subtotal * (taxRate / 100)) * 100) / 100`).

6. Quality Inspection State Transition
- Bug location: `services/jobService.js`, within `recordQualityCheck(jobId, { inspectorId, result, notes }, actor)`
- How to observe it: Run `node tests/runner.js` to observe `test_quality_inspection_state_transition` failing, or submit a quality inspection with `result: 'failed'`.
- Failure: Both branches of the inspection outcome check assign `job.status = 'ready_for_collection'`, improperly advancing defective devices to collection status.
- Expected: When an inspection fails (`result === 'failed'`), the job status must transition to `'ready_to_repair'` with rework required, preventing customer collection until defects are corrected.
