import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import jobsRouter from './routes/jobs.js';
import techniciansRouter from './routes/technicians.js';
import inventoryRouter from './routes/inventory.js';
import engineRouter from './routes/engine.js';
import reportsRouter from './routes/reports.js';
import stateRouter from './routes/state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API Routes
app.use('/api/jobs', jobsRouter);
app.use('/api/technicians', techniciansRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/repair-engine', engineRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/state', stateRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FixFlow Smart Electronics Repair Operations Platform',
    timestamp: new Date().toISOString()
  });
});

// Static assets (relative serving for proxy compatibility)
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for client-side navigation
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Mandatory network binding to 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FixFlow operational platform running on http://0.0.0.0:${PORT}`);
});

export default app;
