import express from 'express';
import inventoryService from '../services/inventoryService.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { lowStockOnly, search } = req.query;
    let parts = inventoryService.getAllParts();

    if (lowStockOnly === 'true') {
      parts = parts.filter(p => p.isLowStock);
    }

    if (search) {
      const q = search.toLowerCase();
      parts = parts.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }

    res.json(parts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/adjustments', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    res.json(inventoryService.getAdjustments(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const part = inventoryService.getPart(req.params.id);
    if (!part) {
      return res.status(404).json({ error: `Part ${req.params.id} not found` });
    }
    res.json(part);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/adjustments', (req, res) => {
  try {
    const updated = inventoryService.adjustStock(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
