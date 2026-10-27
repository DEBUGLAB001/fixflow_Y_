import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'fixflow-db.json');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');

class Database {
  constructor() {
    this.data = null;
    this.init();
  }

  init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      if (fs.existsSync(SEED_FILE)) {
        const seedContent = fs.readFileSync(SEED_FILE, 'utf-8');
        fs.writeFileSync(DB_FILE, seedContent, 'utf-8');
        this.data = JSON.parse(seedContent);
      } else {
        this.data = {
          technicians: [],
          inventory: [],
          inventoryAdjustments: [],
          jobs: []
        };
        this.save();
      }
    } else {
      try {
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(content);
      } catch (err) {
        console.error('Failed to read db file, reloading seed:', err);
        const seedContent = fs.readFileSync(SEED_FILE, 'utf-8');
        this.data = JSON.parse(seedContent);
        this.save();
      }
    }
  }

  save() {
    try {
      const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      // Fallback direct write
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    }
  }

  reset() {
    if (fs.existsSync(SEED_FILE)) {
      const seedContent = fs.readFileSync(SEED_FILE, 'utf-8');
      fs.writeFileSync(DB_FILE, seedContent, 'utf-8');
      this.data = JSON.parse(seedContent);
      return this.data;
    }
    return null;
  }

  getTechnicians() {
    return this.data.technicians || [];
  }

  getTechnicianById(id) {
    return this.getTechnicians().find(t => t.id === id);
  }

  saveTechnician(technician) {
    const list = this.getTechnicians();
    const index = list.findIndex(t => t.id === technician.id);
    if (index >= 0) {
      list[index] = technician;
    } else {
      list.push(technician);
    }
    this.save();
    return technician;
  }

  getInventory() {
    return this.data.inventory || [];
  }

  getPartById(id) {
    return this.getInventory().find(p => p.id === id || p.sku === id);
  }

  savePart(part) {
    const list = this.getInventory();
    const index = list.findIndex(p => p.id === part.id);
    if (index >= 0) {
      list[index] = part;
    } else {
      list.push(part);
    }
    this.save();
    return part;
  }

  getInventoryAdjustments() {
    return this.data.inventoryAdjustments || [];
  }

  addInventoryAdjustment(adjustment) {
    if (!this.data.inventoryAdjustments) {
      this.data.inventoryAdjustments = [];
    }
    const record = {
      id: `ADJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...adjustment
    };
    this.data.inventoryAdjustments.unshift(record);
    this.save();
    return record;
  }

  getJobs() {
    return this.data.jobs || [];
  }

  getJobById(id) {
    return this.getJobs().find(j => j.id === id || j.jobNumber === id);
  }

  saveJob(job) {
    const list = this.getJobs();
    const index = list.findIndex(j => j.id === job.id);
    if (index >= 0) {
      list[index] = job;
    } else {
      list.push(job);
    }
    this.save();
    return job;
  }

  deleteJob(id) {
    const list = this.getJobs();
    const index = list.findIndex(j => j.id === id);
    if (index >= 0) {
      const removed = list.splice(index, 1)[0];
      this.save();
      return removed;
    }
    return null;
  }
}

export const db = new Database();
export default db;
