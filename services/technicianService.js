import db from '../repositories/db.js';

class TechnicianService {
  getAllTechnicians() {
    const technicians = db.getTechnicians();
    const jobs = db.getJobs();

    return technicians.map(tech => this.enrichTechnician(tech, jobs));
  }

  getTechnicianById(id) {
    const tech = db.getTechnicianById(id);
    if (!tech) return null;
    const jobs = db.getJobs();
    return this.enrichTechnician(tech, jobs);
  }

  enrichTechnician(tech, jobs) {
    const activeJobs = jobs.filter(j => 
      j.assignedTechnicianId === tech.id &&
      ['diagnosing', 'waiting_for_parts', 'ready_to_repair', 'in_progress', 'quality_check'].includes(j.status)
    );

    const activeWorkload = activeJobs.length;
    const maxCapacity = Number(tech.maxConcurrentJobs) || 3;
    const isAtCapacity = activeWorkload >= maxCapacity;
    const isAvailableForAssignment = tech.status === 'available' && !isAtCapacity;

    return {
      ...tech,
      activeWorkload,
      maxCapacity,
      isAtCapacity,
      isAvailableForAssignment,
      activeJobIds: activeJobs.map(j => j.jobNumber || j.id)
    };
  }

  hasSkill(tech, requiredSkill) {
    if (!requiredSkill) return true;
    if (!tech || !Array.isArray(tech.skills)) return false;
    const normalizedReq = requiredSkill.toLowerCase().trim();
    return tech.skills.some(s => s.toLowerCase().trim() === normalizedReq);
  }

  findEligibleTechnicians(requiredSkill = null) {
    const technicians = this.getAllTechnicians();
    return technicians.filter(tech => {
      const skillMatches = this.hasSkill(tech, requiredSkill);
      return skillMatches && tech.isAvailableForAssignment;
    });
  }

  updateTechnicianStatus(id, { status, skills, maxConcurrentJobs }) {
    const tech = db.getTechnicianById(id);
    if (!tech) {
      throw new Error(`Technician ${id} not found`);
    }

    if (status) {
      const allowed = ['available', 'busy', 'on_leave'];
      if (!allowed.includes(status)) {
        throw new Error(`Invalid technician status: ${status}`);
      }
      tech.status = status;
    }

    if (Array.isArray(skills)) {
      tech.skills = skills;
    }

    if (maxConcurrentJobs !== undefined) {
      const cap = Number(maxConcurrentJobs);
      if (cap > 0) tech.maxConcurrentJobs = cap;
    }

    db.saveTechnician(tech);
    return this.getTechnicianById(id);
  }
}

export const technicianService = new TechnicianService();
export default technicianService;
