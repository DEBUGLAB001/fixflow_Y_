import db from '../repositories/db.js';
import inventoryService from '../services/inventoryService.js';
import technicianService from '../services/technicianService.js';
import taskService from '../services/taskService.js';
import jobService from '../services/jobService.js';
import repairDependencyEngine from '../services/repairDependencyEngine.js';

export const tests = {
  test_queue_urgency_calculation: async () => {
    // Setup two mock jobs with identical priority (medium), but different deadlines:
    // Job A is due in 2 hours (imminent urgency)
    // Job B is due in 72 hours (distant deadline)
    const now = Date.now();
    const imminentDeadline = new Date(now + 2 * 3600000).toISOString();
    const distantDeadline = new Date(now + 72 * 3600000).toISOString();

    const jobA = {
      id: 'JOB-URGENT-TEST-A',
      jobNumber: 'FIX-TEST-A',
      priority: 'medium',
      status: 'ready_to_repair',
      deadline: imminentDeadline,
      tasks: [
        {
          id: 'TASK-TEST-A1',
          title: 'Imminent Repair Task',
          status: 'ready',
          requiredSkill: 'battery_replacement',
          prerequisites: [],
          requiredParts: []
        }
      ]
    };

    const jobB = {
      id: 'JOB-URGENT-TEST-B',
      jobNumber: 'FIX-TEST-B',
      priority: 'medium',
      status: 'ready_to_repair',
      deadline: distantDeadline,
      tasks: [
        {
          id: 'TASK-TEST-B1',
          title: 'Distant Deadline Task',
          status: 'ready',
          requiredSkill: 'battery_replacement',
          prerequisites: [],
          requiredParts: []
        }
      ]
    };

    // Save temporary jobs to test engine ranking
    db.saveJob(jobA);
    db.saveJob(jobB);

    try {
      const evaluation = repairDependencyEngine.evaluate();
      const recA = evaluation.recommended.find(r => r.jobId === jobA.id);
      const recB = evaluation.recommended.find(r => r.jobId === jobB.id);

      if (!recA || !recB) {
        throw new Error('Both test jobs must be evaluated and recommended by the engine');
      }

      if (recA.score <= recB.score) {
        throw new Error(
          `Imminent deadline job (due in 2h) received lower/equal urgency score (${recA.score}) than distant deadline job (due in 72h, score: ${recB.score}). Closer deadlines must have higher priority.`
        );
      }
    } finally {
      db.deleteJob(jobA.id);
      db.deleteJob(jobB.id);
    }
  },

  test_task_dependency_graph_resolution: async () => {
    // Task with two prerequisites: one completed, one pending
    const tasks = [
      { id: 'TASK-DEP-1', title: 'Prerequisite A', status: 'completed' },
      { id: 'TASK-DEP-2', title: 'Prerequisite B', status: 'pending' },
      { id: 'TASK-DEP-3', title: 'Dependent Task', status: 'pending', prerequisites: ['TASK-DEP-1', 'TASK-DEP-2'] }
    ];

    const satisfied = taskService.arePrerequisitesSatisfied(tasks[2], tasks);
    if (satisfied !== false) {
      throw new Error(
        'Expected prerequisites to NOT be satisfied when one of multiple prerequisites is still pending, but got true. Task prematurely deemed ready.'
      );
    }
  },

  test_inventory_reservation_reconciliation: async () => {
    // Reset database to ensure clean state
    db.reset();

    const partId = 'PART-001';
    const initialPart = inventoryService.getPart(partId);
    const initialReserved = initialPart.reserved;
    const initialOnHand = initialPart.onHand;

    // Consume 1 reserved unit
    inventoryService.consumeReservedPart(partId, 1);

    const updatedPart = inventoryService.getPart(partId);

    if (updatedPart.onHand !== initialOnHand - 1) {
      throw new Error(`Expected physical on-hand stock to decrease by 1, got ${updatedPart.onHand}`);
    }

    if (updatedPart.reserved !== initialReserved - 1) {
      throw new Error(
        `Expected reserved stock to decrease by 1 upon consumption (expected: ${initialReserved - 1}, actual: ${updatedPart.reserved}). Reserved quantity was not reconciled.`
      );
    }
  },

  test_job_cancellation_stock_release: async () => {
    db.reset();

    // Create a job in 'ready_to_repair' with a reserved part
    const part = inventoryService.getPart('PART-002');
    const prevReserved = part.reserved;

    const testJob = jobService.createJob({
      customer: { name: 'Cancellation Tester', phone: '555-0199' },
      device: { type: 'smartphone', model: 'iPhone 14 Pro' },
      priority: 'high'
    });

    // Record diagnosis and reserve part
    jobService.recordDiagnosisAndEstimate(testJob.id, {
      diagnosisNotes: 'Battery replacement needed',
      partsList: [{ partId: 'PART-002', quantity: 1 }],
      approved: true
    });

    const partAfterReserve = inventoryService.getPart('PART-002');
    if (partAfterReserve.reserved <= prevReserved) {
      throw new Error('Precondition failed: Part was not successfully reserved for job');
    }

    // Now cancel the job
    jobService.cancelJob(testJob.id, 'Customer changed mind');

    const partAfterCancel = inventoryService.getPart('PART-002');
    if (partAfterCancel.reserved !== prevReserved) {
      throw new Error(
        `Expected reserved stock for PART-002 to be released on job cancellation (expected reserved: ${prevReserved}, actual: ${partAfterCancel.reserved}).`
      );
    }
  },

  test_repair_cost_estimation: async () => {
    const estimate = jobService.calculateEstimate({
      diagnosisFee: 40.0,
      laborHours: 2.0,
      laborRate: 80.0,
      partsCost: 150.0,
      taxRate: 10
    });

    // Subtotal: 40 + (2 * 80) + 150 = 350.00
    // Tax at 10% on $350.00 subtotal should be $35.00
    // Total should be $385.00
    const expectedSubtotal = 350.0;
    const expectedTax = 35.0;
    const expectedTotal = 385.0;

    if (estimate.subtotal !== expectedSubtotal) {
      throw new Error(`Expected subtotal $${expectedSubtotal}, got $${estimate.subtotal}`);
    }

    if (estimate.tax !== expectedTax) {
      throw new Error(
        `Expected tax of $${expectedTax.toFixed(2)} on repair subtotal $${expectedSubtotal.toFixed(2)}, but got $${estimate.tax.toFixed(2)}. Tax calculation omitted diagnosis or labor costs.`
      );
    }

    if (estimate.total !== expectedTotal) {
      throw new Error(`Expected total $${expectedTotal}, got $${estimate.total}`);
    }
  },

  test_quality_inspection_state_transition: async () => {
    db.reset();

    // Use JOB-1005 which is in quality_check
    const job = jobService.getJob('JOB-1005');
    if (!job) {
      throw new Error('Seed job JOB-1005 not found');
    }

    // Record a failed quality check
    const updated = jobService.recordQualityCheck('JOB-1005', {
      inspectorId: 'TECH-001',
      result: 'failed',
      notes: 'USB-C connection loose under tension. Port requires resolder rework.'
    });

    if (updated.status === 'ready_for_collection') {
      throw new Error(
        "Job with failed quality inspection transitioned to 'ready_for_collection'. Defective devices must be sent to rework ('ready_to_repair')."
      );
    }

    if (updated.status !== 'ready_to_repair') {
      throw new Error(`Expected failed quality check to transition to 'ready_to_repair', got '${updated.status}'`);
    }
  }
};
