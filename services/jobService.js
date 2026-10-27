import db from '../repositories/db.js';
import inventoryService from './inventoryService.js';
import technicianService from './technicianService.js';
import taskService from './taskService.js';

const VALID_STATE_TRANSITIONS = {
  received: ['diagnosing', 'cancelled'],
  diagnosing: ['awaiting_approval', 'cancelled'],
  awaiting_approval: ['waiting_for_parts', 'ready_to_repair', 'cancelled'],
  waiting_for_parts: ['ready_to_repair', 'cancelled'],
  ready_to_repair: ['in_progress', 'cancelled'],
  in_progress: ['quality_check', 'waiting_for_parts', 'cancelled'],
  quality_check: ['ready_for_collection', 'ready_to_repair', 'cancelled'],
  ready_for_collection: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

class JobService {
  getAllJobs() {
    return db.getJobs();
  }

  getJob(id) {
    return db.getJobById(id);
  }

  createJob(jobData) {
    const {
      customer,
      device,
      priority = 'medium',
      deadline,
      intakeNotes,
      reportedIssue
    } = jobData;

    if (!customer || !customer.name || !customer.phone) {
      throw new Error('Customer name and phone number are required');
    }

    if (!device || !device.type || !device.model) {
      throw new Error('Device type and model are required');
    }

    const count = db.getJobs().length + 1001;
    const jobNumber = `FIX-${count}`;
    const id = `JOB-${count}`;

    const newJob = {
      id,
      jobNumber,
      customer: {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        email: customer.email ? customer.email.trim() : ''
      },
      device: {
        type: device.type,
        manufacturer: device.manufacturer || 'Generic',
        model: device.model.trim(),
        serialImei: device.serialImei || '',
        condition: device.condition || 'Used, normal wear',
        reportedIssue: reportedIssue || device.reportedIssue || 'Inspection requested'
      },
      priority: ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium',
      status: 'received',
      intakeDate: new Date().toISOString(),
      deadline: deadline || new Date(Date.now() + 48 * 3600000).toISOString(),
      assignedTechnicianId: null,
      diagnosis: null,
      estimate: null,
      parts: [],
      tasks: [],
      activityHistory: [
        {
          timestamp: new Date().toISOString(),
          action: 'Job Created',
          details: `Job ${jobNumber} registered for ${customer.name}`,
          actor: 'Shop Manager'
        }
      ]
    };

    db.saveJob(newJob);
    return newJob;
  }

  updateJobStatus(jobId, targetStatus, actor = 'System', reason = '') {
    const job = db.getJobById(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === targetStatus) {
      return job;
    }

    const allowedTransitions = VALID_STATE_TRANSITIONS[job.status] || [];
    if (!allowedTransitions.includes(targetStatus)) {
      throw new Error(`Invalid state transition from '${job.status}' to '${targetStatus}'`);
    }

    const previousStatus = job.status;
    job.status = targetStatus;

    job.activityHistory.push({
      timestamp: new Date().toISOString(),
      action: 'Status Updated',
      details: `Status transitioned from '${previousStatus}' to '${targetStatus}'${reason ? ` (${reason})` : ''}`,
      actor
    });

    db.saveJob(job);
    return job;
  }

  assignTechnician(jobId, technicianId, actor = 'Shop Manager') {
    const job = db.getJobById(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (technicianId) {
      const tech = technicianService.getTechnicianById(technicianId);
      if (!tech) {
        throw new Error(`Technician ${technicianId} not found`);
      }

      job.assignedTechnicianId = technicianId;
      job.activityHistory.push({
        timestamp: new Date().toISOString(),
        action: 'Technician Assigned',
        details: `Assigned to ${tech.name} (${tech.specialty || tech.id})`,
        actor
      });
    } else {
      job.assignedTechnicianId = null;
      job.activityHistory.push({
        timestamp: new Date().toISOString(),
        action: 'Technician Unassigned',
        details: 'Technician unassigned from job',
        actor
      });
    }

    db.saveJob(job);
    return job;
  }

  calculateEstimate({ diagnosisFee = 0, laborHours = 0, laborRate = 80, partsCost = 0, taxRate = 10 }) {
    const diagnosis = Number(diagnosisFee) || 0;
    const labor = (Number(laborHours) || 0) * (Number(laborRate) || 0);
    const parts = Number(partsCost) || 0;
    const subtotal = diagnosis + labor + parts;

    // Defect topic: Repair Cost Estimation
    // The standard tax policy applies tax to the repair subtotal.
    // However, this calculation applies tax exclusively to the partsCost.
    const tax = Math.round((parts * (Number(taxRate) / 100)) * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    return {
      diagnosisFee: diagnosis,
      laborHours: Number(laborHours) || 0,
      laborRate: Number(laborRate) || 0,
      laborCost: labor,
      partsCost: parts,
      taxRate: Number(taxRate) || 0,
      subtotal,
      tax,
      total
    };
  }

  recordDiagnosisAndEstimate(jobId, { diagnosisNotes, diagnosedBy, diagnosisFee, laborHours, laborRate, partsCost, taxRate, partsList = [], approved = false, actor = 'Shop Manager' }) {
    const job = db.getJobById(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.diagnosis = {
      notes: diagnosisNotes || 'Diagnosis completed',
      diagnosedBy: diagnosedBy || job.assignedTechnicianId || 'Technician',
      completedAt: new Date().toISOString()
    };

    const estimate = this.calculateEstimate({ diagnosisFee, laborHours, laborRate, partsCost, taxRate });
    estimate.customerApproved = Boolean(approved);
    if (approved) {
      estimate.approvedAt = new Date().toISOString();
    }
    job.estimate = estimate;

    // Allocate / reserve required parts
    if (Array.isArray(partsList) && partsList.length > 0) {
      job.parts = [];
      let allPartsAvailable = true;

      for (const item of partsList) {
        const part = inventoryService.getPart(item.partId);
        const qty = Number(item.quantity) || 1;
        if (!part || part.available < qty) {
          allPartsAvailable = false;
          job.parts.push({ partId: item.partId, quantity: qty, status: 'unfulfilled' });
        } else {
          try {
            inventoryService.reservePart(item.partId, qty);
            job.parts.push({ partId: item.partId, quantity: qty, status: 'reserved' });
          } catch (err) {
            allPartsAvailable = false;
            job.parts.push({ partId: item.partId, quantity: qty, status: 'unfulfilled' });
          }
        }
      }

      if (approved) {
        job.status = allPartsAvailable ? 'ready_to_repair' : 'waiting_for_parts';
      } else {
        job.status = 'awaiting_approval';
      }
    } else {
      if (approved) {
        job.status = 'ready_to_repair';
      } else {
        job.status = 'awaiting_approval';
      }
    }

    job.activityHistory.push({
      timestamp: new Date().toISOString(),
      action: 'Diagnosis & Estimate Recorded',
      details: `Estimate total: $${estimate.total.toFixed(2)}. Status: ${job.status}`,
      actor
    });

    db.saveJob(job);
    return job;
  }

  approveEstimate(jobId, actor = 'Shop Manager') {
    const job = db.getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    if (!job.estimate) {
      throw new Error('Cannot approve estimate before estimate is created');
    }

    job.estimate.customerApproved = true;
    job.estimate.approvedAt = new Date().toISOString();

    // Check if parts are reserved
    const hasUnfulfilledParts = (job.parts || []).some(p => p.status === 'unfulfilled');
    job.status = hasUnfulfilledParts ? 'waiting_for_parts' : 'ready_to_repair';

    job.activityHistory.push({
      timestamp: new Date().toISOString(),
      action: 'Estimate Approved',
      details: `Customer approved repair. Moved to ${job.status}`,
      actor
    });

    db.saveJob(job);
    return job;
  }

  addTask(jobId, taskData, actor = 'Shop Manager') {
    const job = db.getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const {
      title,
      description = '',
      estimatedEffortMinutes = 30,
      requiredSkill,
      requiredParts = [],
      prerequisites = [],
      assignedTechnicianId = null
    } = taskData;

    if (!title) {
      throw new Error('Task title is required');
    }

    const taskId = `TASK-${job.jobNumber.replace('FIX-', '')}-${(job.tasks || []).length + 1}`;
    const newTask = {
      id: taskId,
      title: title.trim(),
      description: description.trim(),
      status: 'pending',
      estimatedEffortMinutes: Number(estimatedEffortMinutes) || 30,
      requiredSkill: requiredSkill || 'screen_replacement',
      requiredParts: Array.isArray(requiredParts) ? requiredParts : [],
      prerequisites: Array.isArray(prerequisites) ? prerequisites : [],
      assignedTechnicianId: assignedTechnicianId || job.assignedTechnicianId
    };

    const prospectiveTasks = [...(job.tasks || []), newTask];
    if (taskService.detectCycle(prospectiveTasks)) {
      throw new Error('Cannot add task: Cyclic dependency detected in task prerequisite graph');
    }

    job.tasks = prospectiveTasks;
    job.activityHistory.push({
      timestamp: new Date().toISOString(),
      action: 'Task Added',
      details: `Task added: ${newTask.title} (${newTask.id})`,
      actor
    });

    db.saveJob(job);
    return { job, task: newTask };
  }

  updateTaskStatus(jobId, taskId, targetStatus, actor = 'Technician') {
    const job = db.getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const task = (job.tasks || []).find(t => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found on job ${jobId}`);

    const previousStatus = task.status;

    if (targetStatus === 'in_progress') {
      const eligibility = taskService.evaluateTaskEligibility(task, job.tasks);
      if (!eligibility.eligible && task.status !== 'in_progress') {
        throw new Error(`Cannot start task: ${eligibility.reason}`);
      }
      task.status = 'in_progress';
      task.startedAt = new Date().toISOString();
      if (job.status === 'ready_to_repair') {
        job.status = 'in_progress';
      }
    } else if (targetStatus === 'completed') {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();

      // Consume any reserved parts associated with this task
      if (Array.isArray(task.requiredParts)) {
        for (const reqPart of task.requiredParts) {
          try {
            inventoryService.consumeReservedPart(reqPart.partId, reqPart.quantity);
            const jobPart = (job.parts || []).find(p => p.partId === reqPart.partId);
            if (jobPart) {
              jobPart.status = 'consumed';
            }
          } catch (err) {
            console.error(`Error consuming part ${reqPart.partId}:`, err);
          }
        }
      }

      // If all tasks are completed, advance job to quality_check
      const allCompleted = job.tasks.every(t => t.status === 'completed');
      if (allCompleted && job.status === 'in_progress') {
        job.status = 'quality_check';
        job.activityHistory.push({
          timestamp: new Date().toISOString(),
          action: 'All Tasks Completed',
          details: 'All repair tasks finished. Job transferred to Quality Check.',
          actor
        });
      }
    } else {
      task.status = targetStatus;
    }

    job.activityHistory.push({
      timestamp: new Date().toISOString(),
      action: 'Task Status Updated',
      details: `Task '${task.title}' updated from ${previousStatus} to ${targetStatus}`,
      actor
    });

    db.saveJob(job);
    return { job, task };
  }

  recordQualityCheck(jobId, { inspectorId, result, notes = '' }, actor = 'Shop Manager') {
    const job = db.getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    if (job.status !== 'quality_check') {
      throw new Error(`Quality check can only be performed when job status is 'quality_check' (current: ${job.status})`);
    }

    if (!['passed', 'failed'].includes(result)) {
      throw new Error("Quality check result must be either 'passed' or 'failed'");
    }

    job.qualityInspection = {
      inspectorId: inspectorId || 'Shop Manager',
      result,
      notes,
      timestamp: new Date().toISOString()
    };

    // Defect topic: Quality Inspection State Transition
    // When inspection passes, job becomes ready_for_collection.
    // When inspection fails, job should return to rework state ('ready_to_repair').
    // However, this logic assigns 'ready_for_collection' in both branches.
    if (result === 'passed') {
      job.status = 'ready_for_collection';
    } else {
      job.status = 'ready_for_collection';
      job.reworkRequired = true;
    }

    job.activityHistory.push({
      timestamp: new Date().toISOString(),
      action: `Quality Inspection ${result === 'passed' ? 'Passed' : 'Failed'}`,
      details: notes || `Inspection completed with outcome: ${result}`,
      actor
    });

    db.saveJob(job);
    return job;
  }

  cancelJob(jobId, reason = 'Customer requested cancellation', actor = 'Shop Manager') {
    const job = db.getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    if (job.status === 'completed' || job.status === 'cancelled') {
      throw new Error(`Cannot cancel a job that is already ${job.status}`);
    }

    // Defect topic: Job Cancellation Stock Release
    // Any reserved parts should be released upon job cancellation.
    // However, this check only releases parts if status is 'in_progress'.
    if (job.status === 'in_progress') {
      this.releaseJobParts(job);
    }

    const previousStatus = job.status;
    job.status = 'cancelled';
    job.cancellationReason = reason;

    job.activityHistory.push({
      timestamp: new Date().toISOString(),
      action: 'Job Cancelled',
      details: `Job cancelled from state '${previousStatus}'. Reason: ${reason}`,
      actor
    });

    db.saveJob(job);
    return job;
  }

  releaseJobParts(job) {
    if (!Array.isArray(job.parts)) return;

    for (const p of job.parts) {
      if (p.status === 'reserved') {
        try {
          inventoryService.releasePartReservation(p.partId, p.quantity);
          p.status = 'released';
        } catch (err) {
          console.error(`Failed to release part ${p.partId}:`, err);
        }
      }
    }
  }
}

export const jobService = new JobService();
export default jobService;
