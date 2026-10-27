import express from 'express';
import jobService from '../services/jobService.js';

const router = express.Router();

// GET all jobs with optional filters
router.get('/', (req, res) => {
  try {
    let jobs = jobService.getAllJobs();
    const { status, priority, technician, search } = req.query;

    if (status) {
      jobs = jobs.filter(j => j.status.toLowerCase() === status.toLowerCase());
    }

    if (priority) {
      jobs = jobs.filter(j => j.priority.toLowerCase() === priority.toLowerCase());
    }

    if (technician) {
      jobs = jobs.filter(j => j.assignedTechnicianId === technician);
    }

    if (search) {
      const q = search.toLowerCase();
      jobs = jobs.filter(j => 
        (j.jobNumber && j.jobNumber.toLowerCase().includes(q)) ||
        (j.customer?.name && j.customer.name.toLowerCase().includes(q)) ||
        (j.device?.model && j.device.model.toLowerCase().includes(q)) ||
        (j.device?.serialImei && j.device.serialImei.toLowerCase().includes(q))
      );
    }

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET job by ID
router.get('/:id', (req, res) => {
  try {
    const job = jobService.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: `Job with ID '${req.params.id}' not found` });
    }
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create job
router.post('/', (req, res) => {
  try {
    const newJob = jobService.createJob(req.body);
    res.status(201).json(newJob);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST assign technician
router.post('/:id/assign-technician', (req, res) => {
  try {
    const { technicianId, actor } = req.body;
    const job = jobService.assignTechnician(req.params.id, technicianId, actor);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST record diagnosis and estimate
router.post('/:id/estimate', (req, res) => {
  try {
    const job = jobService.recordDiagnosisAndEstimate(req.params.id, req.body);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH approve estimate
router.patch('/:id/estimate/approve', (req, res) => {
  try {
    const { actor } = req.body;
    const job = jobService.approveEstimate(req.params.id, actor);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST add task
router.post('/:id/tasks', (req, res) => {
  try {
    const result = jobService.addTask(req.params.id, req.body, req.body.actor);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH update task status
router.patch('/:id/tasks/:taskId/status', (req, res) => {
  try {
    const { status, actor } = req.body;
    const result = jobService.updateTaskStatus(req.params.id, req.params.taskId, status, actor);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST quality check
router.post('/:id/quality-check', (req, res) => {
  try {
    const job = jobService.recordQualityCheck(req.params.id, req.body, req.body.actor);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST cancel job
router.post('/:id/cancel', (req, res) => {
  try {
    const { reason, actor } = req.body;
    const job = jobService.cancelJob(req.params.id, reason, actor);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH update general job status
router.patch('/:id/status', (req, res) => {
  try {
    const { status, actor, reason } = req.body;
    const job = jobService.updateJobStatus(req.params.id, status, actor, reason);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
