import express from 'express';
import db from '../repositories/db.js';

const router = express.Router();

router.post('/reset', (req, res) => {
  try {
    const data = db.reset();
    res.json({ message: 'Database reset to default seed successfully', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/raw', (req, res) => {
  try {
    res.json(db.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
