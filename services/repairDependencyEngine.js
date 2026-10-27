import db from '../repositories/db.js';
import inventoryService from './inventoryService.js';
import technicianService from './technicianService.js';
import taskService from './taskService.js';

const PRIORITY_WEIGHTS = {
  urgent: 100,
  high: 70,
  medium: 40,
  low: 10
};

class RepairDependencyEngine {
  evaluate() {
    const jobs = db.getJobs();
    const inventory = inventoryService.getAllParts();
    const technicians = technicianService.getAllTechnicians();
    const now = Date.now();

    const recommended = [];
    const blocked = [];

    // Filter to active repair jobs
    const activeJobs = jobs.filter(j => 
      ['diagnosing', 'awaiting_approval', 'waiting_for_parts', 'ready_to_repair', 'in_progress'].includes(j.status)
    );

    for (const job of activeJobs) {
      if (job.status === 'diagnosing') {
        blocked.push({
          jobId: job.id,
          jobNumber: job.jobNumber,
          customerName: job.customer?.name,
          device: `${job.device?.manufacturer} ${job.device?.model}`,
          priority: job.priority,
          deadline: job.deadline,
          taskId: null,
          taskTitle: 'Intake Diagnosis',
          reasonCategory: 'diagnosis_required',
          reason: 'Initial hardware diagnosis not completed',
          eligible: false
        });
        continue;
      }

      if (job.status === 'awaiting_approval') {
        blocked.push({
          jobId: job.id,
          jobNumber: job.jobNumber,
          customerName: job.customer?.name,
          device: `${job.device?.manufacturer} ${job.device?.model}`,
          priority: job.priority,
          deadline: job.deadline,
          taskId: null,
          taskTitle: 'Customer Estimate Approval',
          reasonCategory: 'approval_pending',
          reason: 'Awaiting customer quote authorization',
          eligible: false
        });
        continue;
      }

      // Check tasks
      const tasks = job.tasks || [];
      if (tasks.length === 0) {
        blocked.push({
          jobId: job.id,
          jobNumber: job.jobNumber,
          customerName: job.customer?.name,
          device: `${job.device?.manufacturer} ${job.device?.model}`,
          priority: job.priority,
          deadline: job.deadline,
          taskId: null,
          taskTitle: 'Repair Tasks Definition',
          reasonCategory: 'no_tasks',
          reason: 'No repair tasks defined for this job',
          eligible: false
        });
        continue;
      }

      for (const task of tasks) {
        if (task.status === 'completed') {
          continue;
        }

        // 1. Check prerequisite dependencies
        const prereqsSatisfied = taskService.arePrerequisitesSatisfied(task, tasks);
        if (!prereqsSatisfied) {
          const pendingTitles = (task.prerequisites || [])
            .map(id => tasks.find(t => t.id === id))
            .filter(t => !t || t.status !== 'completed')
            .map(t => t ? t.title : id);

          blocked.push({
            jobId: job.id,
            jobNumber: job.jobNumber,
            customerName: job.customer?.name,
            device: `${job.device?.manufacturer} ${job.device?.model}`,
            priority: job.priority,
            deadline: job.deadline,
            taskId: task.id,
            taskTitle: task.title,
            reasonCategory: 'prerequisites_pending',
            reason: `Prerequisite tasks incomplete: ${pendingTitles.join(', ')}`,
            eligible: false
          });
          continue;
        }

        // 2. Check parts availability
        let partsBlockedReason = null;
        if (Array.isArray(task.requiredParts) && task.requiredParts.length > 0) {
          for (const reqPart of task.requiredParts) {
            const part = inventory.find(p => p.id === reqPart.partId || p.sku === reqPart.partId);
            const neededQty = Number(reqPart.quantity) || 1;

            // Check if job already has this part reserved
            const isReservedForJob = (job.parts || []).some(
              jp => (jp.partId === reqPart.partId || jp.partId === part?.id) && (jp.status === 'reserved' || jp.status === 'consumed')
            );

            if (!part) {
              partsBlockedReason = `Required spare part (ID: ${reqPart.partId}) not catalogued`;
              break;
            } else if (!isReservedForJob && part.available < neededQty) {
              partsBlockedReason = `Spare part '${part.name}' out of stock (Available: ${part.available}, Needed: ${neededQty})`;
              break;
            }
          }
        }

        if (partsBlockedReason) {
          blocked.push({
            jobId: job.id,
            jobNumber: job.jobNumber,
            customerName: job.customer?.name,
            device: `${job.device?.manufacturer} ${job.device?.model}`,
            priority: job.priority,
            deadline: job.deadline,
            taskId: task.id,
            taskTitle: task.title,
            reasonCategory: 'part_unavailable',
            reason: partsBlockedReason,
            eligible: false
          });
          continue;
        }

        // 3. Check technician match
        const assignedTechId = task.assignedTechnicianId || job.assignedTechnicianId;
        const assignedTech = technicians.find(t => t.id === assignedTechId);
        const qualifiedTechs = technicians.filter(t => technicianService.hasSkill(t, task.requiredSkill));
        const availableQualifiedTechs = qualifiedTechs.filter(t => t.isAvailableForAssignment);

        if (assignedTech) {
          const hasSkill = technicianService.hasSkill(assignedTech, task.requiredSkill);
          if (!hasSkill) {
            blocked.push({
              jobId: job.id,
              jobNumber: job.jobNumber,
              customerName: job.customer?.name,
              device: `${job.device?.manufacturer} ${job.device?.model}`,
              priority: job.priority,
              deadline: job.deadline,
              taskId: task.id,
              taskTitle: task.title,
              reasonCategory: 'technician_unqualified',
              reason: `Assigned technician ${assignedTech.name} lacks skill '${task.requiredSkill}'`,
              eligible: false
            });
            continue;
          }
        } else if (availableQualifiedTechs.length === 0) {
          blocked.push({
            jobId: job.id,
            jobNumber: job.jobNumber,
            customerName: job.customer?.name,
            device: `${job.device?.manufacturer} ${job.device?.model}`,
            priority: job.priority,
            deadline: job.deadline,
            taskId: task.id,
            taskTitle: task.title,
            reasonCategory: 'no_technician_available',
            reason: `No available technician with skill '${task.requiredSkill}'`,
            eligible: false
          });
          continue;
        }

        // Defect topic: Queue Urgency Calculation
        // The closer the deadline, the higher the urgency score should be.
        // However, this calculation computes (deadline - now) directly,
        // resulting in distant deadlines receiving a higher urgency score.
        const hoursRemaining = (new Date(job.deadline).getTime() - now) / 3600000;
        const urgencyScore = Math.round(hoursRemaining * 10);

        const priorityScore = PRIORITY_WEIGHTS[job.priority] || 40;
        const totalScore = priorityScore + urgencyScore;

        const techLabel = assignedTech
          ? `${assignedTech.name} assigned`
          : `${availableQualifiedTechs.length} technician(s) eligible`;

        recommended.push({
          jobId: job.id,
          jobNumber: job.jobNumber,
          customerName: job.customer?.name,
          device: `${job.device?.manufacturer} ${job.device?.model}`,
          priority: job.priority,
          deadline: job.deadline,
          hoursRemaining: Math.round(hoursRemaining * 10) / 10,
          taskId: task.id,
          taskTitle: task.title,
          taskStatus: task.status,
          requiredSkill: task.requiredSkill,
          estimatedEffortMinutes: task.estimatedEffortMinutes,
          technicianNote: techLabel,
          assignedTechnicianId: assignedTechId,
          assignedTechnicianName: assignedTech?.name || null,
          score: totalScore,
          reason: `Ready to proceed: Prerequisites met, parts available, ${techLabel}.`
        });
      }
    }

    // Sort recommended by descending score
    recommended.sort((a, b) => b.score - a.score);

    return {
      timestamp: new Date().toISOString(),
      summary: {
        recommendedCount: recommended.length,
        blockedCount: blocked.length,
        activeJobsEvaluated: activeJobs.length
      },
      recommended,
      blocked
    };
  }
}

export const repairDependencyEngine = new RepairDependencyEngine();
export default repairDependencyEngine;
