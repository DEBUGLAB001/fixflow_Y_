import express from 'express';
import technicianService from '../services/technicianService.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { skill, availableOnly } = req.query;
    let list = technicianService.getAllTechnicians();

    if (skill) {
      list = list.filter(t => technicianService.hasSkill(t, skill));
    }

    if (availableOnly === 'true') {
      list = list.filter(t => t.isAvailableForAssignment);
    }

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const tech = technicianService.getTechnicianById(req.params.id);
    if (!tech) {
      return res.status(404).json({ error: `Technician ${req.params.id} not found` });
    }
    res.json(tech);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const updated = technicianService.updateTechnicianStatus(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
