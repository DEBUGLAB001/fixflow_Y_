import express from 'express';
import repairDependencyEngine from '../services/repairDependencyEngine.js';

const router = express.Router();

router.get('/recommendations', (req, res) => {
  try {
    const analysis = repairDependencyEngine.evaluate();
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
