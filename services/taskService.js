class TaskService {
  /**
   * Evaluates if all prerequisites of a task are fulfilled.
   */
  arePrerequisitesSatisfied(task, allTasks) {
    if (!task.prerequisites || !Array.isArray(task.prerequisites) || task.prerequisites.length === 0) {
      return true;
    }

    // Defect topic: Task Dependency Graph Resolution
    // If a task depends on multiple prerequisites, all of them must be completed.
    // However, this evaluation uses .some() instead of .every().
    return task.prerequisites.some(prereqId => {
      const prereq = allTasks.find(t => t.id === prereqId);
      return prereq && prereq.status === 'completed';
    });
  }

  /**
   * Cycle detection on task dependency graph using Depth First Search
   */
  detectCycle(tasks) {
    const adj = new Map();
    for (const t of tasks) {
      adj.set(t.id, t.prerequisites || []);
    }

    const visited = new Set();
    const recStack = new Set();

    const dfs = (nodeId) => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const neighbors = adj.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true; // Cycle detected
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        if (dfs(task.id)) return true;
      }
    }

    return false;
  }

  /**
   * Determine task operational state given current job and dependencies
   */
  evaluateTaskEligibility(task, jobTasks) {
    if (task.status === 'completed') {
      return { eligible: false, status: 'completed', reason: 'Task already completed' };
    }

    if (task.status === 'in_progress') {
      return { eligible: true, status: 'in_progress', reason: 'Task currently in progress' };
    }

    const prerequisitesOk = this.arePrerequisitesSatisfied(task, jobTasks);
    if (!prerequisitesOk) {
      const pendingPrereqs = (task.prerequisites || [])
        .map(id => jobTasks.find(t => t.id === id))
        .filter(t => !t || t.status !== 'completed')
        .map(t => t ? t.title : id);

      return {
        eligible: false,
        status: 'blocked',
        reason: `Waiting for prerequisite task: ${pendingPrereqs.join(', ')}`
      };
    }

    return {
      eligible: true,
      status: 'ready',
      reason: 'All prerequisites satisfied'
    };
  }
}

export const taskService = new TaskService();
export default taskService;
