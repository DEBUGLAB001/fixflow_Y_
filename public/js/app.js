/**
 * FixFlow — Smart Electronics Repair Operations Platform
 * Frontend Application Controller
 */

class FixFlowApp {
  constructor() {
    this.apiBase = './api';
    this.activeTab = 'overview';
    this.activeRole = 'manager';
    this.currentJobId = null;
    this.jobs = [];
    this.inventory = [];
    this.technicians = [];
    this.engineData = null;
    this.reportsData = null;
    this.pollInterval = null;

    this.init();
  }

  async init() {
    this.bindEvents();
    this.setupGlobalSearch();
    await this.refreshAll();
    this.startLiveSync();
  }

  // API helper with relative path handling
  async fetchApi(endpoint, options = {}) {
    try {
      const url = `${this.apiBase}${endpoint}`;
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      };

      if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
      }

      const res = await fetch(url, config);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  }

  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = tab.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Role Switcher
    const roleSelect = document.getElementById('userRoleSelect');
    if (roleSelect) {
      roleSelect.addEventListener('change', (e) => {
        this.activeRole = e.target.value;
        this.showToast(`Active role changed to: ${roleSelect.options[roleSelect.selectedIndex].text}`, 'info');
        this.refreshAll();
      });
    }

    // New Job Button
    const btnNewJob = document.getElementById('btnNewJob');
    if (btnNewJob) {
      btnNewJob.addEventListener('click', () => this.openNewJobModal());
    }

    // Reset Demo State Button
    const btnResetState = document.getElementById('btnResetState');
    if (btnResetState) {
      btnResetState.addEventListener('click', () => this.resetDemoState());
    }

    // Drawer Tabs
    document.querySelectorAll('.drawer-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = tab.getAttribute('data-drawer-tab');
        this.switchDrawerTab(target);
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) searchInput.focus();
      }
    });
  }

  setupGlobalSearch() {
    const input = document.getElementById('globalSearchInput');
    if (!input) return;

    input.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (q.length > 0) {
        this.switchTab('jobs');
        const jobsSearch = document.getElementById('filterSearchJobs');
        if (jobsSearch) {
          jobsSearch.value = q;
          this.filterJobs();
        }
      }
    });
  }

  startLiveSync() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    // Poll every 5 seconds for instant live UI updates without reloading
    this.pollInterval = setInterval(() => {
      this.refreshMetricsSilently();
    }, 5000);
  }

  async refreshMetricsSilently() {
    try {
      this.reportsData = await this.fetchApi('/reports/overview');
      this.renderOverviewKPIs(this.reportsData);
      this.updateSidebarCapacity(this.reportsData);

      // If active tab is engine or overview, refresh engine data
      if (this.activeTab === 'overview' || this.activeTab === 'engine') {
        this.engineData = await this.fetchApi('/repair-engine/recommendations');
        this.renderEngineView();
        this.renderOverviewRecommendations();
      }
    } catch (err) {
      // Silent error during polling
    }
  }

  async refreshAll() {
    try {
      const [reports, jobs, inventory, technicians, engine] = await Promise.all([
        this.fetchApi('/reports/overview'),
        this.fetchApi('/jobs'),
        this.fetchApi('/inventory'),
        this.fetchApi('/technicians'),
        this.fetchApi('/repair-engine/recommendations')
      ]);

      this.reportsData = reports;
      this.jobs = jobs;
      this.inventory = inventory;
      this.technicians = technicians;
      this.engineData = engine;

      this.renderOverviewKPIs(reports);
      this.updateSidebarCapacity(reports);
      this.renderOverviewRecommendations();
      this.renderOverviewBlockers();
      this.renderOverviewLowStock();
      this.renderEngineView();
      this.renderJobsTable(this.jobs);
      this.renderTechniciansGrid();
      this.renderInventoryView();
      this.renderReportsView();
      this.populateGraphJobSelect();

      // Update badge counts in sidebar
      this.updateSidebarBadges();
    } catch (err) {
      this.showToast(`Failed to load operations data: ${err.message}`, 'error');
    }
  }

  updateSidebarBadges() {
    const badgeTotal = document.getElementById('badgeTotalInShop');
    const badgeEngine = document.getElementById('badgeEngineReady');
    const badgeJobs = document.getElementById('badgeJobsCount');
    const badgeLowStock = document.getElementById('badgeLowStockCount');

    if (badgeTotal && this.reportsData) badgeTotal.textContent = this.reportsData.counts.inShop;
    if (badgeEngine && this.engineData) badgeEngine.textContent = this.engineData.summary.recommendedCount;
    if (badgeJobs && this.jobs) badgeJobs.textContent = this.jobs.length;
    if (badgeLowStock && this.reportsData) badgeLowStock.textContent = this.reportsData.inventorySummary.lowStockCount;
  }

  updateSidebarCapacity(reports) {
    if (!reports || !reports.techniciansSummary) return;
    const techs = reports.techniciansSummary;
    const totalCap = techs.reduce((acc, t) => acc + (t.maxCapacity || 3), 0);
    const activeLoad = techs.reduce((acc, t) => acc + (t.activeWorkload || 0), 0);
    const pct = totalCap > 0 ? Math.min(100, Math.round((activeLoad / totalCap) * 100)) : 0;

    const fill = document.getElementById('sidebarCapacityFill');
    const text = document.getElementById('sidebarCapacityText');
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `${pct}% Loaded (${activeLoad}/${totalCap})`;
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${tabId}`);
    });

    if (tabId === 'engine') this.loadEngineData();
    if (tabId === 'inventory') this.loadInventoryAdjustments();
    if (tabId === 'graph') this.renderDependencyGraph();
    if (tabId === 'reports') this.renderReportsView();
  }

  // =========================================================================
  // 1. OPERATIONS OVERVIEW
  // =========================================================================

  renderOverviewKPIs(reports) {
    if (!reports || !reports.counts) return;
    const c = reports.counts;

    const kpiInShop = document.getElementById('kpiInShop');
    const kpiAwaiting = document.getElementById('kpiAwaitingDiagnosis');
    const kpiInProgress = document.getElementById('kpiInProgress');
    const kpiWaitingParts = document.getElementById('kpiWaitingParts');
    const kpiReadyCollection = document.getElementById('kpiReadyCollection');
    const kpiOverdue = document.getElementById('kpiOverdue');
    const kpiActivePercent = document.getElementById('kpiActivePercent');
    const kpiOverdueMeta = document.getElementById('kpiOverdueMeta');

    if (kpiInShop) kpiInShop.textContent = c.inShop;
    if (kpiAwaiting) kpiAwaiting.textContent = c.awaitingDiagnosis;
    if (kpiInProgress) kpiInProgress.textContent = c.inProgress;
    if (kpiWaitingParts) kpiWaitingParts.textContent = c.waitingForParts;
    if (kpiReadyCollection) kpiReadyCollection.textContent = c.readyForCollection;
    if (kpiOverdue) kpiOverdue.textContent = c.overdue;

    if (kpiActivePercent) {
      const pct = c.inShop > 0 ? Math.round(((c.inProgress + c.readyForCollection) / c.inShop) * 100) : 0;
      kpiActivePercent.textContent = `${pct}%`;
    }

    if (kpiOverdueMeta) {
      kpiOverdueMeta.textContent = `${c.overdue} overdue, ${c.deadlineApproaching} within 24h`;
    }
  }

  renderOverviewRecommendations() {
    const container = document.getElementById('overviewRecommendationsList');
    if (!container || !this.engineData) return;

    const list = this.engineData.recommended || [];
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No repair tasks currently ready to proceed.</p>
          <span class="text-sm text-muted">All active repairs are awaiting diagnosis, parts, or customer approval.</span>
        </div>
      `;
      return;
    }

    const topThree = list.slice(0, 3);
    container.innerHTML = topThree.map((item, index) => {
      const urgencyClass = item.priority === 'urgent' ? 'text-danger' : item.priority === 'high' ? 'text-warning' : 'text-primary';
      const maxScore = Math.max(100, item.score);
      const fillPct = Math.min(100, Math.round((item.score / maxScore) * 100));

      return `
        <div class="rec-card">
          <div class="rec-card-top">
            <div class="d-flex align-center gap-2">
              <span class="rec-rank-badge">#${index + 1} TOP PRIORITY</span>
              <span class="status-chip status-${item.taskStatus}">${item.taskStatus}</span>
              <span class="priority-chip priority-${item.priority}">${item.priority}</span>
            </div>
            <div class="rec-score-meter">
              <span>Score: ${item.score}</span>
              <div class="rec-score-bar">
                <div class="rec-score-fill" style="width: ${fillPct}%;"></div>
              </div>
            </div>
          </div>

          <div class="rec-title">${item.taskTitle}</div>

          <div class="rec-meta-row">
            <span><strong>${item.jobNumber}</strong> &bull; ${item.device}</span>
            <span>&bull;</span>
            <span>Customer: ${item.customerName || 'Walk-in'}</span>
            <span>&bull;</span>
            <span class="${urgencyClass}">Due: ${this.formatHoursLeft(item.hoursRemaining)}</span>
          </div>

          <div class="rec-reason-banner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            ${item.reason}
          </div>

          <div class="rec-action-row">
            <div class="text-xs text-muted">
              Tech: <strong>${item.assignedTechnicianName || item.technicianNote}</strong> &bull; Est: ${item.estimatedEffortMinutes} mins
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-secondary btn-xs" onclick="app.openJobDetails('${item.jobId}')">View Job</button>
              <button class="btn btn-primary btn-xs" onclick="app.startTask('${item.jobId}', '${item.taskId}')">
                ${item.taskStatus === 'in_progress' ? 'Mark Completed' : 'Start Task Now'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderOverviewBlockers() {
    const container = document.getElementById('overviewBlockersList');
    if (!container || !this.engineData) return;

    const list = this.engineData.blocked || [];
    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state">No critical blockers active. Workshop flows cleanly.</div>`;
      return;
    }

    container.innerHTML = list.slice(0, 4).map(b => `
      <div class="blocker-item">
        <svg class="blocker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div class="blocker-info">
          <div class="blocker-header">
            <span>${b.jobNumber} — ${b.device}</span>
            <span class="priority-chip priority-${b.priority}">${b.priority}</span>
          </div>
          <div class="blocker-reason">${b.reason}</div>
        </div>
        <button class="btn btn-secondary btn-xs" onclick="app.openJobDetails('${b.jobId}')">Inspect</button>
      </div>
    `).join('');
  }

  renderOverviewLowStock() {
    const tbody = document.getElementById('overviewLowStockTbody');
    if (!tbody || !this.reportsData) return;

    const items = this.reportsData.inventorySummary.lowStockItems || [];
    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center py-2">All spare parts above safety thresholds.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(part => `
      <tr>
        <td>
          <strong>${part.name}</strong><br>
          <code class="text-xs text-muted">${part.sku}</code>
        </td>
        <td><span class="text-danger font-mono font-bold">${part.onHand}</span></td>
        <td class="font-mono text-muted">${part.reserved}</td>
        <td><strong class="font-mono text-warning">${part.available}</strong></td>
        <td class="font-mono text-muted">${part.reorderThreshold}</td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // 2. REPAIR DEPENDENCY ENGINE (USP)
  // =========================================================================

  async loadEngineData() {
    try {
      this.engineData = await this.fetchApi('/repair-engine/recommendations');
      this.renderEngineView();
      this.showToast('Repair Dependency Engine queue refreshed', 'success');
    } catch (err) {
      this.showToast(`Engine evaluation failed: ${err.message}`, 'error');
    }
  }

  renderEngineView() {
    if (!this.engineData) return;

    const recCount = this.engineData.summary.recommendedCount;
    const blockCount = this.engineData.summary.blockedCount;

    const statReady = document.getElementById('engineStatReady');
    const statBlocked = document.getElementById('engineStatBlocked');
    const badgeReady = document.getElementById('engineReadyBadge');
    const badgeBlocked = document.getElementById('engineBlockedBadge');

    if (statReady) statReady.textContent = `${recCount} Tasks`;
    if (statBlocked) statBlocked.textContent = `${blockCount} Tasks`;
    if (badgeReady) badgeReady.textContent = `${recCount} Ready`;
    if (badgeBlocked) badgeBlocked.textContent = `${blockCount} Blocked`;

    // Render Recommended Work Stack
    const recContainer = document.getElementById('engineRecommendedCards');
    if (recContainer) {
      const list = this.engineData.recommended || [];
      if (list.length === 0) {
        recContainer.innerHTML = `<div class="empty-state">No repair tasks are currently ready for scheduling.</div>`;
      } else {
        recContainer.innerHTML = list.map((item, index) => {
          return `
            <div class="rec-card">
              <div class="rec-card-top">
                <div class="d-flex align-center gap-2">
                  <span class="rec-rank-badge">RANK #${index + 1}</span>
                  <span class="status-chip status-${item.taskStatus}">${item.taskStatus}</span>
                  <span class="priority-chip priority-${item.priority}">${item.priority}</span>
                  <code class="text-xs">${item.jobNumber}</code>
                </div>
                <div class="rec-score-meter">
                  <span>Score: ${item.score}</span>
                </div>
              </div>

              <div class="rec-title">${item.taskTitle}</div>
              <div class="rec-meta-row">
                <span>Device: <strong>${item.device}</strong></span>
                <span>&bull;</span>
                <span>Skill: <strong class="text-primary">${this.formatSkill(item.requiredSkill)}</strong></span>
                <span>&bull;</span>
                <span>Deadline: ${this.formatHoursLeft(item.hoursRemaining)}</span>
              </div>

              <div class="rec-reason-banner">
                ${item.reason}
              </div>

              <div class="rec-action-row">
                <div class="text-xs text-muted">
                  ${item.technicianNote} &bull; Effort: ${item.estimatedEffortMinutes}m
                </div>
                <div class="d-flex gap-2">
                  <button class="btn btn-secondary btn-xs" onclick="app.openJobDetails('${item.jobId}')">Open Job</button>
                  <button class="btn btn-primary btn-xs" onclick="app.startTask('${item.jobId}', '${item.taskId}')">
                    ${item.taskStatus === 'in_progress' ? 'Complete Task' : 'Start Task'}
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Render Blocked Repairs Stack
    const blockContainer = document.getElementById('engineBlockedCards');
    if (blockContainer) {
      const list = this.engineData.blocked || [];
      if (list.length === 0) {
        blockContainer.innerHTML = `<div class="empty-state">No tasks are currently blocked.</div>`;
      } else {
        blockContainer.innerHTML = list.map(item => `
          <div class="blocker-item">
            <svg class="blocker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <div class="blocker-info">
              <div class="blocker-header">
                <span><strong>${item.jobNumber}</strong> &bull; ${item.device}</span>
                <span class="priority-chip priority-${item.priority}">${item.priority}</span>
              </div>
              <div class="text-xs text-muted mb-1">
                Blocked Task: <strong>${item.taskTitle || 'Job Initiation'}</strong>
              </div>
              <div class="blocker-reason">
                <strong>Operational Constraint:</strong> ${item.reason}
              </div>
            </div>
            <button class="btn btn-secondary btn-xs" onclick="app.openJobDetails('${item.jobId}')">Resolve</button>
          </div>
        `).join('');
      }
    }
  }

  // =========================================================================
  // 3. REPAIR JOBS MANAGEMENT
  // =========================================================================

  filterJobs() {
    const status = document.getElementById('filterStatus')?.value || '';
    const priority = document.getElementById('filterPriority')?.value || '';
    const tech = document.getElementById('filterTechnician')?.value || '';
    const search = (document.getElementById('filterSearchJobs')?.value || '').toLowerCase().trim();

    const filtered = this.jobs.filter(job => {
      if (status && job.status.toLowerCase() !== status.toLowerCase()) return false;
      if (priority && job.priority.toLowerCase() !== priority.toLowerCase()) return false;
      if (tech && job.assignedTechnicianId !== tech) return false;
      if (search) {
        const matchNumber = job.jobNumber && job.jobNumber.toLowerCase().includes(search);
        const matchCustomer = job.customer?.name && job.customer.name.toLowerCase().includes(search);
        const matchModel = job.device?.model && job.device.model.toLowerCase().includes(search);
        const matchImei = job.device?.serialImei && job.device.serialImei.toLowerCase().includes(search);
        if (!matchNumber && !matchCustomer && !matchModel && !matchImei) return false;
      }
      return true;
    });

    this.renderJobsTable(filtered);
  }

  resetJobFilters() {
    if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = '';
    if (document.getElementById('filterPriority')) document.getElementById('filterPriority').value = '';
    if (document.getElementById('filterTechnician')) document.getElementById('filterTechnician').value = '';
    if (document.getElementById('filterSearchJobs')) document.getElementById('filterSearchJobs').value = '';
    this.renderJobsTable(this.jobs);
  }

  renderJobsTable(jobsList) {
    const tbody = document.getElementById('jobsTableBody');
    if (!tbody) return;

    if (!jobsList || jobsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No repair jobs match the specified criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = jobsList.map(job => {
      const tech = this.technicians.find(t => t.id === job.assignedTechnicianId);
      const techName = tech ? tech.name : '<span class="text-muted">Unassigned</span>';
      const estTotal = job.estimate ? `$${job.estimate.total.toFixed(2)}` : '<span class="text-muted">Pending</span>';
      const deadlineStr = this.formatDeadline(job.deadline);

      return `
        <tr>
          <td>
            <a href="javascript:void(0)" onclick="app.openJobDetails('${job.id}')" class="font-mono font-bold text-primary">
              ${job.jobNumber}
            </a>
          </td>
          <td>
            <strong>${job.customer?.name || 'Walk-in'}</strong><br>
            <span class="text-xs text-muted">${job.customer?.phone || '-'}</span>
          </td>
          <td>
            <strong>${job.device?.manufacturer || ''} ${job.device?.model || ''}</strong><br>
            <span class="text-xs text-muted">${job.device?.type || 'device'} &bull; ${job.device?.serialImei ? `IMEI: ${job.device.serialImei}` : ''}</span>
          </td>
          <td><span class="priority-chip priority-${job.priority}">${job.priority}</span></td>
          <td><span class="status-chip status-${job.status}">${this.formatStatus(job.status)}</span></td>
          <td>${deadlineStr}</td>
          <td>${techName}</td>
          <td class="font-mono">${estTotal}</td>
          <td>
            <button class="btn btn-secondary btn-xs" onclick="app.openJobDetails('${job.id}')">Manage</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // 4. JOB DETAILS DRAWER & OPERATIONS
  // =========================================================================

  async openJobDetails(jobId) {
    try {
      const job = await this.fetchApi(`/jobs/${jobId}`);
      this.currentJobId = jobId;

      // Header
      document.getElementById('drawerJobNumber').textContent = job.jobNumber;
      const statusChip = document.getElementById('drawerJobStatus');
      statusChip.className = `status-chip status-${job.status}`;
      statusChip.textContent = this.formatStatus(job.status);

      const priorityChip = document.getElementById('drawerJobPriority');
      priorityChip.className = `priority-chip priority-${job.priority}`;
      priorityChip.textContent = job.priority;

      // Summary Tab
      document.getElementById('drawerCustName').textContent = job.customer?.name || '-';
      document.getElementById('drawerCustPhone').textContent = job.customer?.phone || '-';
      document.getElementById('drawerCustEmail').textContent = job.customer?.email || 'None';

      document.getElementById('drawerDeviceType').textContent = job.device?.type || '-';
      document.getElementById('drawerDeviceMake').textContent = job.device?.manufacturer || '-';
      document.getElementById('drawerDeviceModel').textContent = job.device?.model || '-';
      document.getElementById('drawerDeviceSerial').textContent = job.device?.serialImei || 'Not provided';
      document.getElementById('drawerDeviceCondition').textContent = job.device?.condition || 'Normal used condition';
      document.getElementById('drawerReportedIssue').textContent = job.device?.reportedIssue || 'None';

      // Tech assignment select
      const techSelect = document.getElementById('drawerAssignTechSelect');
      if (techSelect) {
        techSelect.value = job.assignedTechnicianId || '';
      }

      document.getElementById('drawerDeadlineBadge').innerHTML = this.formatDeadline(job.deadline);

      // Estimate Tab
      document.getElementById('drawerDiagnosisNotes').value = job.diagnosis?.notes || '';
      if (job.estimate) {
        document.getElementById('estDiagnosisFee').value = job.estimate.diagnosisFee;
        document.getElementById('estLaborHours').value = job.estimate.laborHours;
        document.getElementById('estLaborRate').value = job.estimate.laborRate;
        document.getElementById('estPartsCost').value = job.estimate.partsCost;
        document.getElementById('estTaxRate').value = job.estimate.taxRate;
      }
      this.updateEstimatePreview();

      const approvalBadge = document.getElementById('drawerApprovalStatus');
      if (approvalBadge) {
        if (job.estimate && job.estimate.customerApproved) {
          approvalBadge.className = 'approval-badge-wrap text-success';
          approvalBadge.textContent = '✓ Customer Approved';
        } else {
          approvalBadge.className = 'approval-badge-wrap text-warning';
          approvalBadge.textContent = '⚠ Awaiting Customer Approval';
        }
      }

      // Tasks Tab
      this.renderDrawerTasks(job);
      this.renderDrawerParts(job);

      // Quality Check Tab
      this.renderDrawerQualityCheck(job);

      // Audit History Tab
      this.renderDrawerHistory(job);

      // Open drawer
      document.getElementById('jobDetailsDrawer').classList.add('active');
    } catch (err) {
      this.showToast(`Error opening job: ${err.message}`, 'error');
    }
  }

  closeJobDrawer() {
    const drawer = document.getElementById('jobDetailsDrawer');
    if (drawer) drawer.classList.remove('active');
    this.currentJobId = null;
  }

  switchDrawerTab(tabId) {
    document.querySelectorAll('.drawer-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-drawer-tab') === tabId);
    });

    document.querySelectorAll('.drawer-tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `drawerTab-${tabId}`);
    });
  }

  async handleAssignTechnician() {
    if (!this.currentJobId) return;
    const techSelect = document.getElementById('drawerAssignTechSelect');
    const techId = techSelect.value || null;

    try {
      await this.fetchApi(`/jobs/${this.currentJobId}/assign-technician`, {
        method: 'POST',
        body: {
          technicianId: techId,
          actor: this.getActorName()
        }
      });

      this.showToast('Technician assigned successfully', 'success');
      await this.refreshAll();
      this.openJobDetails(this.currentJobId);
    } catch (err) {
      this.showToast(`Assignment failed: ${err.message}`, 'error');
    }
  }

  updateEstimatePreview() {
    const diag = Number(document.getElementById('estDiagnosisFee')?.value) || 0;
    const hours = Number(document.getElementById('estLaborHours')?.value) || 0;
    const rate = Number(document.getElementById('estLaborRate')?.value) || 0;
    const parts = Number(document.getElementById('estPartsCost')?.value) || 0;
    const taxRate = Number(document.getElementById('estTaxRate')?.value) || 10;

    const labor = hours * rate;
    const subtotal = diag + labor + parts;
    // Follow backend calculateEstimate logic
    const tax = Math.round((parts * (taxRate / 100)) * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    if (document.getElementById('recDiagnosisFee')) document.getElementById('recDiagnosisFee').textContent = `$${diag.toFixed(2)}`;
    if (document.getElementById('recLaborCost')) document.getElementById('recLaborCost').textContent = `$${labor.toFixed(2)}`;
    if (document.getElementById('recPartsCost')) document.getElementById('recPartsCost').textContent = `$${parts.toFixed(2)}`;
    if (document.getElementById('recSubtotal')) document.getElementById('recSubtotal').textContent = `$${subtotal.toFixed(2)}`;
    if (document.getElementById('recTax')) document.getElementById('recTax').textContent = `$${tax.toFixed(2)}`;
    if (document.getElementById('recTotal')) document.getElementById('recTotal').textContent = `$${total.toFixed(2)}`;
  }

  async saveDiagnosisAndEstimate(approved = false) {
    if (!this.currentJobId) return;

    const notes = document.getElementById('drawerDiagnosisNotes').value;
    const diag = Number(document.getElementById('estDiagnosisFee').value) || 0;
    const hours = Number(document.getElementById('estLaborHours').value) || 0;
    const rate = Number(document.getElementById('estLaborRate').value) || 0;
    const parts = Number(document.getElementById('estPartsCost').value) || 0;
    const taxRate = Number(document.getElementById('estTaxRate').value) || 10;

    try {
      await this.fetchApi(`/jobs/${this.currentJobId}/estimate`, {
        method: 'POST',
        body: {
          diagnosisNotes: notes,
          diagnosisFee: diag,
          laborHours: hours,
          laborRate: rate,
          partsCost: parts,
          taxRate: taxRate,
          approved: approved,
          actor: this.getActorName()
        }
      });

      this.showToast(approved ? 'Diagnosis saved & customer approved!' : 'Diagnosis estimate saved', 'success');
      await this.refreshAll();
      this.openJobDetails(this.currentJobId);
    } catch (err) {
      this.showToast(`Failed saving estimate: ${err.message}`, 'error');
    }
  }

  renderDrawerTasks(job) {
    const container = document.getElementById('drawerTasksList');
    if (!container) return;

    const tasks = job.tasks || [];
    if (tasks.length === 0) {
      container.innerHTML = `<div class="empty-state">No repair tasks added yet. Click "+ Add Task" to define procedure steps.</div>`;
      return;
    }

    container.innerHTML = tasks.map(task => {
      const isCompleted = task.status === 'completed';
      const isInProgress = task.status === 'in_progress';
      const prereqsStr = task.prerequisites && task.prerequisites.length > 0
        ? `Prereqs: ${task.prerequisites.join(', ')}`
        : 'No prerequisites (Root task)';

      return `
        <div class="rec-card mb-2 ${isCompleted ? 'border-success' : ''}">
          <div class="d-flex justify-between align-center mb-1">
            <span class="status-chip status-${task.status}">${task.status}</span>
            <span class="text-xs text-muted font-mono">${task.id}</span>
          </div>
          <div class="font-bold text-white mb-1">${task.title}</div>
          <div class="text-xs text-muted mb-2">${task.description || 'No instructions provided.'}</div>
          <div class="d-flex justify-between align-center text-xs text-muted">
            <span>Skill: <strong>${this.formatSkill(task.requiredSkill)}</strong> &bull; ${task.estimatedEffortMinutes}m</span>
            <span>${prereqsStr}</span>
          </div>

          <div class="d-flex justify-between align-center mt-3 pt-2 border-top">
            <span class="text-xs text-muted">
              ${task.completedAt ? `Finished ${new Date(task.completedAt).toLocaleTimeString()}` : ''}
            </span>
            <div class="d-flex gap-2">
              ${!isCompleted ? `
                <button class="btn btn-secondary btn-xs" onclick="app.updateTaskStatus('${job.id}', '${task.id}', '${isInProgress ? 'completed' : 'in_progress'}')">
                  ${isInProgress ? '✓ Complete & Consume Parts' : '▶ Start Task'}
                </button>
              ` : `
                <span class="text-success text-xs font-bold">✓ Task Completed</span>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderDrawerParts(job) {
    const container = document.getElementById('drawerPartsList');
    if (!container) return;

    const parts = job.parts || [];
    if (parts.length === 0) {
      container.innerHTML = `<div class="text-sm text-muted">No spare parts currently allocated for this job.</div>`;
      return;
    }

    container.innerHTML = parts.map(p => {
      const partObj = this.inventory.find(inv => inv.id === p.partId);
      const name = partObj ? partObj.name : p.partId;
      const sku = partObj ? partObj.sku : '';
      const statusClass = p.status === 'consumed' ? 'text-success' : p.status === 'reserved' ? 'text-primary' : 'text-danger';

      return `
        <div class="d-flex justify-between align-center py-1 border-bottom">
          <div>
            <strong>${name}</strong> <code class="text-xs text-muted">${sku}</code>
          </div>
          <div class="d-flex align-center gap-2">
            <span class="font-mono">Qty: ${p.quantity}</span>
            <span class="text-xs font-bold ${statusClass}">[${p.status.toUpperCase()}]</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderDrawerQualityCheck(job) {
    const statusBox = document.getElementById('qaInspectionStatusBox');
    if (!statusBox) return;

    if (job.qualityInspection) {
      const qi = job.qualityInspection;
      const isPass = qi.result === 'passed';
      statusBox.innerHTML = `
        <div class="p-3 border rounded ${isPass ? 'bg-success-subtle border-success' : 'bg-danger-subtle border-danger'}">
          <div class="font-bold ${isPass ? 'text-success' : 'text-danger'} mb-1">
            ${isPass ? '✓ QUALITY INSPECTION PASSED' : '✕ QUALITY INSPECTION FAILED'}
          </div>
          <div class="text-sm text-muted">Inspector: ${qi.inspectorId} &bull; ${new Date(qi.timestamp).toLocaleString()}</div>
          <div class="text-sm mt-1"><strong>Notes:</strong> ${qi.notes || 'None'}</div>
        </div>
      `;
    } else {
      statusBox.innerHTML = `<div class="text-sm text-muted">Quality inspection not yet recorded for this device.</div>`;
    }
  }

  renderDrawerHistory(job) {
    const timeline = document.getElementById('drawerAuditTimeline');
    if (!timeline) return;

    const events = job.activityHistory || [];
    timeline.innerHTML = events.slice().reverse().map(ev => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-header">
          <span>${ev.action}</span>
          <span class="timeline-time">${new Date(ev.timestamp).toLocaleString()}</span>
        </div>
        <div class="timeline-details">${ev.details}</div>
        <div class="text-xs text-muted mt-1">By: ${ev.actor || 'System'}</div>
      </div>
    `).join('');
  }

  async updateTaskStatus(jobId, taskId, newStatus) {
    try {
      await this.fetchApi(`/jobs/${jobId}/tasks/${taskId}/status`, {
        method: 'PATCH',
        body: {
          status: newStatus,
          actor: this.getActorName()
        }
      });

      this.showToast(`Task status updated to ${newStatus}`, 'success');
      await this.refreshAll();
      if (this.currentJobId === jobId) {
        this.openJobDetails(jobId);
      }
    } catch (err) {
      this.showToast(`Task update failed: ${err.message}`, 'error');
    }
  }

  async startTask(jobId, taskId) {
    // Quick action from Engine or Overview
    const job = this.jobs.find(j => j.id === jobId);
    const task = job?.tasks?.find(t => t.id === taskId);
    const nextStatus = task?.status === 'in_progress' ? 'completed' : 'in_progress';
    await this.updateTaskStatus(jobId, taskId, nextStatus);
  }

  async submitQualityInspection() {
    if (!this.currentJobId) return;

    const radios = document.getElementsByName('qaResult');
    let result = 'passed';
    for (const r of radios) {
      if (r.checked) result = r.value;
    }
    const notes = document.getElementById('qaNotes').value;

    try {
      await this.fetchApi(`/jobs/${this.currentJobId}/quality-check`, {
        method: 'POST',
        body: {
          inspectorId: this.getActorName(),
          result,
          notes,
          actor: this.getActorName()
        }
      });

      this.showToast(`Quality check recorded (${result.toUpperCase()})`, 'success');
      await this.refreshAll();
      this.openJobDetails(this.currentJobId);
    } catch (err) {
      this.showToast(`Inspection submission failed: ${err.message}`, 'error');
    }
  }

  openCancelJobModal() {
    if (!this.currentJobId) return;
    const job = this.jobs.find(j => j.id === this.currentJobId);
    if (!job) return;

    document.getElementById('cancelJobNumber').textContent = job.jobNumber;
    document.getElementById('cancelJobModal').classList.add('active');
  }

  async confirmCancelJob() {
    if (!this.currentJobId) return;
    const reason = document.getElementById('cancelJobReason').value || 'Customer requested cancellation';

    try {
      await this.fetchApi(`/jobs/${this.currentJobId}/cancel`, {
        method: 'POST',
        body: {
          reason,
          actor: this.getActorName()
        }
      });

      this.showToast('Job cancelled successfully', 'warning');
      this.closeModal('cancelJobModal');
      this.closeJobDrawer();
      await this.refreshAll();
    } catch (err) {
      this.showToast(`Cancellation failed: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // 5. TECHNICIANS & WORKLOAD
  // =========================================================================

  renderTechniciansGrid() {
    const grid = document.getElementById('techniciansGrid');
    if (!grid) return;

    grid.innerHTML = this.technicians.map(tech => {
      const initials = tech.name.split(' ').map(n => n[0]).join('');
      const capPct = Math.min(100, Math.round((tech.activeWorkload / tech.maxCapacity) * 100));
      const gaugeClass = capPct >= 100 ? 'danger' : capPct >= 70 ? 'warning' : 'normal';

      return `
        <div class="tech-card">
          <div class="tech-card-header">
            <div class="tech-avatar">${initials}</div>
            <div class="flex-1">
              <div class="tech-name">${tech.name}</div>
              <div class="tech-specialty">${tech.specialty || 'Electronics Repair Technician'}</div>
            </div>
            <span class="status-indicator-dot ${tech.status === 'available' ? 'online' : 'offline'}" title="${tech.status}"></span>
          </div>

          <div class="workload-gauge">
            <div class="gauge-header">
              <span>Workload: <strong>${tech.activeWorkload} / ${tech.maxCapacity} active jobs</strong></span>
              <span class="font-bold">${capPct}%</span>
            </div>
            <div class="gauge-bar">
              <div class="gauge-fill ${gaugeClass}" style="width: ${capPct}%;"></div>
            </div>
          </div>

          <div class="text-xs text-muted mb-2 font-bold">COMPETENCIES &amp; SKILLS:</div>
          <div class="tech-skills-wrap">
            ${(tech.skills || []).map(s => `<span class="skill-tag">${this.formatSkill(s)}</span>`).join('')}
          </div>

          <div class="d-flex justify-between align-center mt-3 pt-2 border-top text-xs text-muted">
            <span>Rating: ★ <strong>${tech.rating || 4.9}</strong></span>
            <div class="d-flex align-center gap-1">
              <span>Status:</span>
              <select class="form-select py-0 px-1 text-xs" onchange="app.updateTechStatus('${tech.id}', this.value)">
                <option value="available" ${tech.status === 'available' ? 'selected' : ''}>Available</option>
                <option value="busy" ${tech.status === 'busy' ? 'selected' : ''}>Busy</option>
                <option value="on_leave" ${tech.status === 'on_leave' ? 'selected' : ''}>On Leave</option>
              </select>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async updateTechStatus(techId, status) {
    try {
      await this.fetchApi(`/technicians/${techId}`, {
        method: 'PATCH',
        body: { status }
      });
      this.showToast('Technician status updated', 'success');
      await this.refreshAll();
    } catch (err) {
      this.showToast(`Failed updating technician: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // 6. SPARE-PARTS INVENTORY WORKSPACE
  // =========================================================================

  renderInventoryView() {
    this.filterInventory();

    // Summary counters
    const onHandTotal = this.inventory.reduce((acc, p) => acc + (p.onHand || 0), 0);
    const reservedTotal = this.inventory.reduce((acc, p) => acc + (p.reserved || 0), 0);
    const availableTotal = this.inventory.reduce((acc, p) => acc + (p.available || 0), 0);
    const lowStockTotal = this.inventory.filter(p => p.isLowStock).length;

    const elSkus = document.getElementById('invTotalSKUs');
    const elOnHand = document.getElementById('invTotalOnHand');
    const elRes = document.getElementById('invTotalReserved');
    const elAvail = document.getElementById('invTotalAvailable');
    const elLow = document.getElementById('invTotalLowStock');

    if (elSkus) elSkus.textContent = this.inventory.length;
    if (elOnHand) elOnHand.textContent = onHandTotal;
    if (elRes) elRes.textContent = reservedTotal;
    if (elAvail) elAvail.textContent = availableTotal;
    if (elLow) elLow.textContent = lowStockTotal;
  }

  filterInventory() {
    const lowOnly = document.getElementById('chkLowStockOnly')?.checked || false;
    const search = (document.getElementById('txtInventorySearch')?.value || '').toLowerCase().trim();

    const filtered = this.inventory.filter(p => {
      if (lowOnly && !p.isLowStock) return false;
      if (search) {
        const mSku = p.sku && p.sku.toLowerCase().includes(search);
        const mName = p.name && p.name.toLowerCase().includes(search);
        const mCat = p.category && p.category.toLowerCase().includes(search);
        if (!mSku && !mName && !mCat) return false;
      }
      return true;
    });

    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-state">No inventory items match search.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const statusPill = p.onHand === 0 
        ? '<span class="status-chip status-waiting_for_parts">Depleted</span>'
        : p.isLowStock
        ? '<span class="status-chip status-awaiting_approval">Low Stock</span>'
        : '<span class="status-chip status-completed">In Stock</span>';

      return `
        <tr>
          <td><code class="font-bold text-primary">${p.sku}</code></td>
          <td><strong>${p.name}</strong></td>
          <td><span class="badge-pill">${p.category}</span></td>
          <td class="text-xs text-muted">${(p.supportedModels || []).join(', ')}</td>
          <td><strong class="font-mono ${p.isLowStock ? 'text-danger' : ''}">${p.onHand}</strong></td>
          <td class="font-mono text-warning">${p.reserved}</td>
          <td><strong class="font-mono ${p.available === 0 ? 'text-danger' : 'text-success'}">${p.available}</strong></td>
          <td class="font-mono text-muted">${p.reorderThreshold}</td>
          <td class="font-mono">$${(p.unitCost || 0).toFixed(2)}</td>
          <td>${statusPill}</td>
          <td>
            <button class="btn btn-secondary btn-xs" onclick="app.openAdjustStockModal('${p.id}')">Adjust</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async loadInventoryAdjustments() {
    try {
      const adjustments = await this.fetchApi('/inventory/adjustments?limit=25');
      const tbody = document.getElementById('inventoryAdjustmentsTbody');
      if (!tbody) return;

      if (!adjustments || adjustments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No adjustments recorded.</td></tr>`;
        return;
      }

      tbody.innerHTML = adjustments.map(adj => {
        const changeStr = adj.quantityChange > 0 ? `+${adj.quantityChange}` : `${adj.quantityChange}`;
        const changeClass = adj.quantityChange > 0 ? 'text-success' : 'text-danger';

        return `
          <tr>
            <td class="text-xs text-muted">${new Date(adj.timestamp).toLocaleString()}</td>
            <td><code>${adj.partSku || adj.partId}</code></td>
            <td><span class="badge-pill">${adj.type}</span></td>
            <td><strong class="${changeClass} font-mono">${changeStr}</strong></td>
            <td class="text-xs">${adj.reason}</td>
            <td class="text-xs text-muted">${adj.performer || 'System'}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed loading adjustments:', err);
    }
  }

  openAdjustStockModal(partId) {
    const part = this.inventory.find(p => p.id === partId);
    if (!part) return;

    document.getElementById('adjustPartId').value = part.id;
    document.getElementById('adjustPartName').textContent = part.name;
    document.getElementById('adjustPartSku').textContent = part.sku;
    document.getElementById('adjustStockModal').classList.add('active');
  }

  async handleAdjustStock(e) {
    e.preventDefault();
    const form = e.target;
    const partId = form.partId.value;
    const type = form.adjustmentType.value;
    const qtyChange = Number(form.quantityChange.value);
    const reason = form.reason.value;

    try {
      await this.fetchApi(`/inventory/${partId}/adjustments`, {
        method: 'POST',
        body: {
          quantityChange: qtyChange,
          type,
          reason,
          performer: this.getActorName()
        }
      });

      this.showToast('Stock adjustment applied successfully', 'success');
      this.closeModal('adjustStockModal');
      await this.refreshAll();
      this.loadInventoryAdjustments();
    } catch (err) {
      this.showToast(`Adjustment failed: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // 7. TASK DEPENDENCY GRAPH (DAG VIEW)
  // =========================================================================

  populateGraphJobSelect() {
    const select = document.getElementById('graphJobSelect');
    if (!select) return;

    select.innerHTML = this.jobs.map(j => `
      <option value="${j.id}">${j.jobNumber} — ${j.device?.manufacturer} ${j.device?.model} (${(j.tasks || []).length} tasks)</option>
    `).join('');
  }

  renderDependencyGraph() {
    const select = document.getElementById('graphJobSelect');
    const container = document.getElementById('dependencyGraphContainer');
    if (!select || !container) return;

    const jobId = select.value || (this.jobs[0]?.id);
    const job = this.jobs.find(j => j.id === jobId);

    if (!job || !job.tasks || job.tasks.length === 0) {
      container.innerHTML = `<div class="empty-state">No task dependency chain defined for this repair job.</div>`;
      return;
    }

    container.innerHTML = job.tasks.map((task, idx) => {
      const isLast = idx === job.tasks.length - 1;
      const statusClass = task.status;
      const prereqs = task.prerequisites && task.prerequisites.length > 0 
        ? task.prerequisites.join(', ')
        : 'None (Root Node)';

      return `
        <div class="dag-node ${statusClass}">
          <div class="dag-node-header">
            <span class="status-chip status-${task.status}">${task.status}</span>
            <code class="text-xs font-mono">${task.id}</code>
          </div>
          <div class="dag-node-title">${task.title}</div>
          <div class="dag-node-meta mb-2">
            Skill: <strong>${this.formatSkill(task.requiredSkill)}</strong><br>
            Effort: ${task.estimatedEffortMinutes}m
          </div>
          <div class="text-xs text-muted border-top pt-1">
            <strong>Prerequisites:</strong> ${prereqs}
          </div>
        </div>
        ${!isLast ? `<div class="dag-connector-arrow">➔</div>` : ''}
      `;
    }).join('');
  }

  // =========================================================================
  // 8. REPORTS & METRICS VIEW
  // =========================================================================

  renderReportsView() {
    if (!this.reportsData) return;

    const r = this.reportsData;
    const c = r.counts;

    // Status distribution
    const statusWrap = document.getElementById('reportStatusBars');
    if (statusWrap) {
      const statuses = [
        { label: 'Received & Intake', val: c.awaitingDiagnosis, color: 'var(--cyan-primary)' },
        { label: 'In Progress (Bench)', val: c.inProgress, color: 'var(--purple-accent)' },
        { label: 'Waiting for Spare Parts', val: c.waitingForParts, color: 'var(--red-danger)' },
        { label: 'Quality Inspection', val: c.qualityCheck, color: 'var(--pink-neon)' },
        { label: 'Ready for Collection', val: c.readyForCollection, color: 'var(--green-success)' },
        { label: 'Completed Repairs', val: c.completed, color: 'var(--text-muted)' },
        { label: 'Cancelled Jobs', val: c.cancelled, color: 'var(--text-muted)' }
      ];

      const maxVal = Math.max(1, ...statuses.map(s => s.val));

      statusWrap.innerHTML = statuses.map(s => `
        <div class="chart-bar-row">
          <div class="chart-bar-label">
            <span>${s.label}</span>
            <strong>${s.val}</strong>
          </div>
          <div class="chart-bar-track">
            <div class="chart-bar-fill" style="width: ${(s.val / maxVal) * 100}%; background: ${s.color};"></div>
          </div>
        </div>
      `).join('');
    }

    // Technician Workload
    const techWrap = document.getElementById('reportTechBars');
    if (techWrap && r.techniciansSummary) {
      techWrap.innerHTML = r.techniciansSummary.map(t => {
        const pct = Math.min(100, Math.round((t.activeWorkload / t.maxCapacity) * 100));
        const color = pct >= 100 ? 'var(--red-danger)' : pct >= 70 ? 'var(--amber-warning)' : 'var(--cyan-primary)';

        return `
          <div class="chart-bar-row">
            <div class="chart-bar-label">
              <span>${t.name} (${t.status})</span>
              <strong>${t.activeWorkload} / ${t.maxCapacity}</strong>
            </div>
            <div class="chart-bar-track">
              <div class="chart-bar-fill" style="width: ${pct}%; background: ${color};"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Financials
    const finWrap = document.getElementById('reportFinancials');
    if (finWrap && r.financials) {
      finWrap.innerHTML = `
        <div class="fin-metric-row">
          <span>Estimated Approved Repair Revenue:</span>
          <strong class="font-mono text-success font-bold" style="font-size:1.2rem;">$${r.financials.estimatedApprovedRevenue.toFixed(2)}</strong>
        </div>
        <div class="fin-metric-row">
          <span>Total Catalogued Spare Parts:</span>
          <strong class="font-mono">${r.inventorySummary.totalSKUs} SKUs</strong>
        </div>
        <div class="fin-metric-row">
          <span>Active Workshop Jobs:</span>
          <strong class="font-mono">${c.inShop} active</strong>
        </div>
      `;
    }

    // SLA
    const slaWrap = document.getElementById('reportSla');
    if (slaWrap) {
      slaWrap.innerHTML = `
        <div class="fin-metric-row">
          <span>Overdue Jobs:</span>
          <strong class="font-mono text-danger">${c.overdue}</strong>
        </div>
        <div class="fin-metric-row">
          <span>Deadlines Approaching (&le; 24h):</span>
          <strong class="font-mono text-warning">${c.deadlineApproaching}</strong>
        </div>
        <div class="fin-metric-row">
          <span>Average Engine Turnaround Readiness:</span>
          <strong class="font-mono text-success">${r.engineSummary.recommendedCount} Tasks Ready</strong>
        </div>
      `;
    }
  }

  // =========================================================================
  // 9. MODALS & FORMS
  // =========================================================================

  openNewJobModal() {
    const deadlineInput = document.getElementById('newJobDeadlineInput');
    if (deadlineInput) {
      // Default to 48 hours in future
      const target = new Date(Date.now() + 48 * 3600000);
      deadlineInput.value = target.toISOString().slice(0, 16);
    }
    document.getElementById('newJobModal').classList.add('active');
  }

  async handleCreateJob(e) {
    e.preventDefault();
    const form = e.target;

    const payload = {
      customer: {
        name: form.customerName.value,
        phone: form.customerPhone.value,
        email: form.customerEmail.value
      },
      device: {
        type: form.deviceType.value,
        manufacturer: form.manufacturer.value,
        model: form.model.value,
        serialImei: form.serialImei.value,
        condition: form.condition.value,
        reportedIssue: form.reportedIssue.value
      },
      priority: form.priority.value,
      deadline: form.deadline.value ? new Date(form.deadline.value).toISOString() : undefined,
      reportedIssue: form.reportedIssue.value
    };

    try {
      const created = await this.fetchApi('/jobs', {
        method: 'POST',
        body: payload
      });

      this.showToast(`Job ${created.jobNumber} created successfully!`, 'success');
      form.reset();
      this.closeModal('newJobModal');
      await this.refreshAll();
      this.openJobDetails(created.id);
    } catch (err) {
      this.showToast(`Failed creating job: ${err.message}`, 'error');
    }
  }

  openAddTaskModal() {
    if (!this.currentJobId) return;
    const job = this.jobs.find(j => j.id === this.currentJobId);
    if (!job) return;

    const prereqContainer = document.getElementById('addTaskPrereqsContainer');
    if (prereqContainer) {
      const tasks = job.tasks || [];
      if (tasks.length === 0) {
        prereqContainer.innerHTML = `<span class="text-xs text-muted">No existing tasks on this job to select as prerequisite.</span>`;
      } else {
        prereqContainer.innerHTML = tasks.map(t => `
          <label class="d-flex align-center gap-2 text-xs py-1">
            <input type="checkbox" name="prereqs" value="${t.id}">
            <span><strong>${t.id}</strong> — ${t.title} (${t.status})</span>
          </label>
        `).join('');
      }
    }

    document.getElementById('addTaskModal').classList.add('active');
  }

  async handleAddTask(e) {
    e.preventDefault();
    if (!this.currentJobId) return;

    const form = e.target;
    const title = form.taskTitle.value;
    const description = form.taskDescription.value;
    const effort = Number(form.taskEffort.value) || 30;
    const skill = form.taskSkill.value;

    const prereqCheckboxes = form.querySelectorAll('input[name="prereqs"]:checked');
    const prerequisites = Array.from(prereqCheckboxes).map(cb => cb.value);

    try {
      await this.fetchApi(`/jobs/${this.currentJobId}/tasks`, {
        method: 'POST',
        body: {
          title,
          description,
          estimatedEffortMinutes: effort,
          requiredSkill: skill,
          prerequisites,
          actor: this.getActorName()
        }
      });

      this.showToast('Task added successfully', 'success');
      form.reset();
      this.closeModal('addTaskModal');
      await this.refreshAll();
      this.openJobDetails(this.currentJobId);
    } catch (err) {
      this.showToast(`Failed to add task: ${err.message}`, 'error');
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.closeJobDrawer();
  }

  async resetDemoState() {
    if (!confirm('Reset FixFlow database to default seed fixtures? This resets all active repair jobs and inventory.')) {
      return;
    }

    try {
      await this.fetchApi('/state/reset', { method: 'POST' });
      this.showToast('Database reset to initial seed fixtures', 'success');
      await this.refreshAll();
    } catch (err) {
      this.showToast(`Reset failed: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // UTILITY HELPERS
  // =========================================================================

  getActorName() {
    if (this.activeRole === 'manager') return 'Shop Manager';
    const tech = this.technicians.find(t => t.id === this.activeRole);
    return tech ? tech.name : 'Workshop Staff';
  }

  formatStatus(status) {
    return (status || '').replace(/_/g, ' ');
  }

  formatSkill(skill) {
    if (!skill) return 'General Repair';
    return skill.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  formatDeadline(iso) {
    if (!iso) return '<span class="text-muted">No deadline</span>';
    const target = new Date(iso).getTime();
    const diffHours = (target - Date.now()) / 3600000;

    if (diffHours < 0) {
      const overdueHours = Math.abs(Math.round(diffHours));
      return `<span class="badge-pill badge-danger font-mono font-bold">OVERDUE (-${overdueHours}h)</span>`;
    } else if (diffHours <= 24) {
      return `<span class="badge-pill badge-danger font-mono font-bold">${Math.round(diffHours)}h left</span>`;
    } else {
      const days = Math.round(diffHours / 24);
      return `<span class="font-mono text-muted text-xs">${days}d left</span>`;
    }
  }

  formatHoursLeft(hours) {
    if (hours === undefined || hours === null) return 'N/A';
    if (hours <= 0) return 'OVERDUE';
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)} days`;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new FixFlowApp();
});
