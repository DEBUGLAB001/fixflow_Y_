import express from 'express';
import db from '../repositories/db.js';
import inventoryService from '../services/inventoryService.js';
import technicianService from '../services/technicianService.js';
import repairDependencyEngine from '../services/repairDependencyEngine.js';

const router = express.Router();

router.get('/overview', (req, res) => {
  try {
    const jobs = db.getJobs();
    const inventory = inventoryService.getAllParts();
    const technicians = technicianService.getAllTechnicians();
    const engineResults = repairDependencyEngine.evaluate();

    const now = Date.now();

    const inShopJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status));
    const awaitingDiagnosis = jobs.filter(j => j.status === 'diagnosing' || (j.status === 'received' && !j.diagnosis));
    const inProgress = jobs.filter(j => j.status === 'in_progress');
    const waitingForParts = jobs.filter(j => j.status === 'waiting_for_parts');
    const qualityCheck = jobs.filter(j => j.status === 'quality_check');
    const readyForCollection = jobs.filter(j => j.status === 'ready_for_collection');
    const completed = jobs.filter(j => j.status === 'completed');
    const cancelled = jobs.filter(j => j.status === 'cancelled');

    const overdueJobs = inShopJobs.filter(j => {
      if (!j.deadline) return false;
      return new Date(j.deadline).getTime() < now;
    });

    const deadlineApproachingJobs = inShopJobs.filter(j => {
      if (!j.deadline) return false;
      const diffHours = (new Date(j.deadline).getTime() - now) / 3600000;
      return diffHours > 0 && diffHours <= 24;
    });

    const lowStockParts = inventory.filter(p => p.isLowStock);

    const totalEstimateRevenue = jobs
      .filter(j => j.estimate && j.estimate.customerApproved && j.status !== 'cancelled')
      .reduce((sum, j) => sum + (Number(j.estimate.total) || 0), 0);

    const metrics = {
      counts: {
        totalJobs: jobs.length,
        inShop: inShopJobs.length,
        awaitingDiagnosis: awaitingDiagnosis.length,
        inProgress: inProgress.length,
        waitingForParts: waitingForParts.length,
        qualityCheck: qualityCheck.length,
        readyForCollection: readyForCollection.length,
        completed: completed.length,
        cancelled: cancelled.length,
        overdue: overdueJobs.length,
        deadlineApproaching: deadlineApproachingJobs.length
      },
      inventorySummary: {
        totalSKUs: inventory.length,
        lowStockCount: lowStockParts.length,
        lowStockItems: lowStockParts
      },
      techniciansSummary: technicians.map(t => ({
        id: t.id,
        name: t.name,
        specialty: t.specialty,
        activeWorkload: t.activeWorkload,
        maxCapacity: t.maxCapacity,
        isAtCapacity: t.isAtCapacity,
        status: t.status
      })),
      engineSummary: {
        recommendedCount: engineResults.recommended.length,
        blockedCount: engineResults.blocked.length,
        topRecommendations: engineResults.recommended.slice(0, 3),
        blockedIssues: engineResults.blocked.slice(0, 5)
      },
      financials: {
        estimatedApprovedRevenue: Math.round(totalEstimateRevenue * 100) / 100
      }
    };

    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
