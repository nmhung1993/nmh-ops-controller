// ===== STATE =====
let token = localStorage.getItem('wc_token') || '';
let user = JSON.parse(localStorage.getItem('wc_user') || 'null');
let ws = null;
let monitoredConfig = { monitoredProcesses: [] };
let currentEditingMonitored = null;
let currentEditingUser = null;
let currentPasswordUser = null;
let relaunchHistory = [];
let historyData = { cpu: [], mem: [], net: [] };
// 60 minutes of history at 2s intervals = 1800 points
const MAX_POINTS = 1800;
let diskCharts = [];
let cpuLineChart = null;
let memLineChart = null;
let netLineChart = null;
let currentLang = localStorage.getItem('wc_lang') || 'en';
let translations = {};

// ===== I18N =====
async function loadTranslations(lang) {
  try {
    const res = await fetch(`lang/${lang}.json`);
    translations = await res.json();
    currentLang = lang;
    localStorage.setItem('wc_lang', lang);
    applyTranslations();
  } catch (e) {
    console.error('Failed to load translations:', e);
  }
}

function t(key) {
  return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : key), translations);
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  // Update document title
  document.title = t('app.title');
}

function setLanguage(lang) {
  loadTranslations(lang);
}

// ===== HELPERS =====
function $(id) { return document.getElementById(id); }

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString();
}

function showToast(message, type = 'info') {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ===== API =====
async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ===== AUTH =====
function login(e) {
  e.preventDefault();
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  $('login-error').textContent = '';

  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        $('login-error').textContent = data.error;
        return;
      }
      token = data.token;
      user = { username: data.username, role: data.role };
      localStorage.setItem('wc_token', token);
      localStorage.setItem('wc_user', JSON.stringify(user));
      showApp();
    })
    .catch(err => {
      $('login-error').textContent = 'Login failed';
    });
}

function logout() {
  token = '';
  user = null;
  localStorage.removeItem('wc_token');
  localStorage.removeItem('wc_user');
  if (ws) { ws.close(); ws = null; }
  $('app').classList.remove('active');
  $('login-page').style.display = 'flex';
}

function showApp() {
  $('login-page').style.display = 'none';
  $('app').classList.add('active');
  $('current-username').textContent = user.username;
  $('current-role').textContent = user.role === 'admin' ? '👑 Admin' : '👤 User';

  // Show admin link only for admins
  if (user.role === 'admin') {
    $('admin-link').style.display = '';
  } else {
    $('admin-link').style.display = 'none';
    // Hide admin page nav if currently on it
    if (location.hash === '#admin') location.hash = '#dashboard';
  }

  // Hide monitor config actions for non-admins
  const isAdmin = user.role === 'admin';
  $('add-monitored-btn').style.display = isAdmin ? '' : 'none';
  $('add-user-btn').style.display = isAdmin ? '' : 'none';
  $('save-webhook-btn').style.display = isAdmin ? '' : 'none';
  $('discord-webhook-input').disabled = !isAdmin;

  initCharts();
  connectWS();
  loadConfig();
  loadProcesses();
  loadHistory();
  if (isAdmin) loadUsers();
  navigate();
}

// ===== NAVIGATION =====
function navigate() {
  const hash = location.hash || '#dashboard';
  const page = hash.replace('#', '');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));

  const pageEl = $('page-' + page);
  if (pageEl) {
    pageEl.classList.add('active');
    const navLink = document.querySelector(`.sidebar nav a[data-page="${page}"]`);
    if (navLink) navLink.classList.add('active');
  } else {
    $('page-dashboard').classList.add('active');
    document.querySelector('.sidebar nav a[data-page="dashboard"]').classList.add('active');
  }
}

// ===== WEBSOCKET =====
function connectWS() {
  if (!token) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'telemetry') {
      updateTelemetry(msg.data);
    } else if (msg.type === 'relaunch') {
      showToast(`Process "${msg.processName}" ${msg.status === 'relaunched' ? 'relaunched' : 'FAILED to relaunch'}`, msg.status === 'relaunched' ? 'success' : 'error');
      loadHistory();
      loadProcesses();
    }
  };

  ws.onclose = () => {
    setTimeout(connectWS, 3000);
  };
}

// ===== CHARTS =====
function initCharts() {
  if (typeof Chart === 'undefined') return;

  // CPU line chart
  const cpuCtx = $('cpu-line-chart').getContext('2d');
  cpuLineChart = new Chart(cpuCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'CPU %',
        data: [],
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56,189,248,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        y: { min: 0, max: 100, grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8 } }
      },
      plugins: { legend: { display: false } }
    }
  });

  // Memory line chart
  const memCtx = $('mem-line-chart').getContext('2d');
  memLineChart = new Chart(memCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Memory %',
        data: [],
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        y: { min: 0, max: 100, grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8 } }
      },
      plugins: { legend: { display: false } }
    }
  });

  // Network line chart
  const netCtx = $('net-line-chart').getContext('2d');
  netLineChart = new Chart(netCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Received MB/s',
          data: [],
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167,139,250,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Sent MB/s',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        y: { grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8 } }
      },
      plugins: {
        legend: { labels: { color: '#94a3b8', boxWidth: 12 } }
      }
    }
  });
}

// ===== TELEMETRY =====
let lastNetwork = { sentBytes: 0, recvBytes: 0 };
let lastNetTime = Date.now();

function updateTelemetry(t) {
  const now = Date.now();
  const timeLabel = new Date(now).toLocaleTimeString();

  // Update history data
  historyData.cpu.push({ t: timeLabel, v: parseFloat(t.cpu.usage) });
  historyData.mem.push({ t: timeLabel, v: parseFloat(t.memory.percent) });

  // Network rate (MB/s)
  const dt = (now - lastNetTime) / 1000;
  const sentRate = dt > 0 ? ((t.network.sentBytes - lastNetwork.sentBytes) / dt / 1048576) : 0;
  const recvRate = dt > 0 ? ((t.network.recvBytes - lastNetwork.recvBytes) / dt / 1048576) : 0;
  historyData.net.push({ t: timeLabel, recv: Math.max(0, recvRate), sent: Math.max(0, sentRate) });
  lastNetwork = { sentBytes: t.network.sentBytes, recvBytes: t.network.recvBytes };
  lastNetTime = now;

  if (historyData.cpu.length > MAX_POINTS) historyData.cpu.shift();
  if (historyData.mem.length > MAX_POINTS) historyData.mem.shift();
  if (historyData.net.length > MAX_POINTS) historyData.net.shift();

  // Update charts
  if (cpuLineChart) {
    cpuLineChart.data.labels = historyData.cpu.map(d => d.t);
    cpuLineChart.data.datasets[0].data = historyData.cpu.map(d => d.v);
    cpuLineChart.update();
  }
  if (memLineChart) {
    memLineChart.data.labels = historyData.mem.map(d => d.t);
    memLineChart.data.datasets[0].data = historyData.mem.map(d => d.v);
    memLineChart.update();
  }
  if (netLineChart) {
    netLineChart.data.labels = historyData.net.map(d => d.t);
    netLineChart.data.datasets[0].data = historyData.net.map(d => d.recv);
    netLineChart.data.datasets[1].data = historyData.net.map(d => d.sent);
    netLineChart.update();
  }
  updateDiskCharts(t.disk);
  $('cpu-value').textContent = `${t.cpu.usage}%`;
  $('cpu-bar').style.width = `${t.cpu.usage}%`;
  $('cpu-cores').textContent = `${t.cpu.cores} cores`;
  $('cpu-model').textContent = t.cpu.model || '';

  $('mem-value').textContent = `${t.memory.percent}%`;
  $('mem-bar').style.width = `${t.memory.percent}%`;
  $('mem-free').textContent = `Free: ${formatBytes(t.memory.free)}`;
  $('mem-total').textContent = `Total: ${formatBytes(t.memory.total)}`;

  $('uptime-value').textContent = formatUptime(t.uptime);

  $('os-value').textContent = t.os || '--';
  $('net-model').textContent = t.cpu.model || '';

  // Network
  $('net-recv').textContent = formatBytes(t.network.recvBytes);
  $('net-sent').textContent = formatBytes(t.network.sentBytes);
}

function updateDiskCharts(disks) {
  if (!disks || disks.length === 0) return;
  const container = $('disk-charts');
  const colors = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#ef4444', '#ec4899'];

  // Ensure we have DOM + chart for each drive
  disks.forEach((d, i) => {
    let item = container.querySelector(`.disk-chart-item[data-drive="${d.drive}"]`);
    if (!item) {
      item = document.createElement('div');
      item.className = 'disk-chart-item';
      item.dataset.drive = d.drive;
      item.innerHTML = `
        <div class="drive-label">${d.drive}</div>
        <div class="chart-wrap">
          <canvas></canvas>
        </div>
        <div class="drive-info"></div>
      `;
      container.appendChild(item);

      const ctx = item.querySelector('canvas').getContext('2d');
      const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Used', 'Free'],
          datasets: [{
            data: [0, 1],
            backgroundColor: [colors[i % colors.length], 'rgba(148,163,184,0.2)'],
            borderColor: 'rgba(15,23,42,0.8)',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
      diskCharts.push(chart);
    }

    // Update chart data
    const chartIdx = [...container.children].indexOf(item);
    const chart = diskCharts[chartIdx];
    const used = d.used;
    const free = d.total - d.used;
    chart.data.datasets[0].data = [used, free];
    chart.update();

    // Update info
    const pct = d.total > 0 ? ((d.used / d.total) * 100).toFixed(1) : 0;
    item.querySelector('.drive-info').textContent = `${pct}% · ${formatBytes(d.used)} / ${formatBytes(d.total)}`;
  });

  // Remove charts for drives that no longer exist
  const existing = [...container.querySelectorAll('.disk-chart-item')];
  existing.forEach(item => {
    if (!disks.find(d => d.drive === item.dataset.drive)) {
      const idx = [...container.children].indexOf(item);
      if (diskCharts[idx]) diskCharts[idx].destroy();
      diskCharts.splice(idx, 1);
      item.remove();
    }
  });
}

// ===== PROCESSES =====
async function loadProcesses() {
  try {
    const procs = await api('/api/processes');
    renderProcesses(procs);
  } catch (err) {
    console.error(err);
  }
}

function renderProcesses(procs) {
  const body = $('process-table-body');
  const search = $('process-search').value.toLowerCase();
  const filtered = procs.filter(p =>
    p.name.toLowerCase().includes(search) || (p.path || '').toLowerCase().includes(search)
  );

  $('proc-count').textContent = procs.length;
  $('app-count').textContent = filtered.length;

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">No processes found</td></tr>';
    return;
  }

  const isAdmin = user.role === 'admin';
  body.innerHTML = filtered.map(p => `
    <tr>
      <td>${p.pid}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.cpu || 0}</td>
      <td>${p.memoryMB || 0}</td>
      <td title="${escapeHtml(p.path || '')}" style="max-width:300px; overflow:hidden; text-overflow:ellipsis">${escapeHtml(p.path || '-')}</td>
      <td>
        ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="killProc(${p.pid}, '${p.name}')">Kill</button>` : '<span style="color:var(--text-muted)">-</span>'}
      </td>
    </tr>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function killProc(pid, name) {
  if (!confirm(`Kill process "${name}" (PID ${pid})?`)) return;
  try {
    await api(`/api/processes/${pid}/kill`, { method: 'POST' });
    showToast(`Process "${name}" killed`, 'success');
    loadProcesses();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== CONFIG / WATCHDOG =====
function maskWebhook(url) {
  if (!url) return '';
  if (url.length <= 10) return '••••••••••';
  return '••••••••••' + url.slice(-10);
}

async function loadConfig() {
  try {
    monitoredConfig = await api('/api/config');
    renderMonitored();
    // Populate Discord webhook field (masked - show only last 10 chars)
    if (user.role === 'admin') {
      $('discord-webhook-input').value = maskWebhook(monitoredConfig.discordWebhook || '');
    }
  } catch (err) {
    console.error(err);
  }
}

async function saveWebhook() {
  const inputValue = $('discord-webhook-input').value.trim();
  // If the value still contains the masked placeholder (••••), keep the original webhook
  let webhook = inputValue.includes('••••') ? (monitoredConfig.discordWebhook || '') : inputValue;
  const items = monitoredConfig.monitoredProcesses || [];
  try {
    await api('/api/config', {
      method: 'POST',
      body: JSON.stringify({ monitoredProcesses: items, discordWebhook: webhook })
    });
    monitoredConfig.discordWebhook = webhook;
    // Re-mask the input after saving
    $('discord-webhook-input').value = maskWebhook(webhook);
    showToast(user.role === 'admin' ? 'Webhook saved' : 'Configuration saved', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderMonitored() {
  const list = $('monitored-list');
  const items = monitoredConfig.monitoredProcesses || [];
  const isAdmin = user.role === 'admin';

  if (items.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted)">No monitored processes configured</p>';
    return;
  }

  list.innerHTML = items.map((item, idx) => `
    <div class="monitored-card">
      <div>
        <div class="proc-name">${escapeHtml(item.processName)} <span class="badge ${item.enabled ? 'badge-running' : 'badge-down'}">${item.enabled ? 'Active' : 'Disabled'}</span></div>
        <div class="proc-path">${escapeHtml(item.filePath || '')}</div>
      </div>
      ${isAdmin ? `
      <div class="actions">
        <button class="btn btn-success btn-sm" onclick="manualLaunch(${idx})">🚀 Launch</button>
        <button class="btn btn-sm" onclick="editMonitored(${idx})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="removeMonitored(${idx})">Remove</button>
      </div>` : ''}
    </div>
  `).join('');
}

async function manualLaunch(idx) {
  const items = monitoredConfig.monitoredProcesses || [];
  const item = items[idx];
  if (!item || !item.filePath) {
    showToast('Process or file path missing', 'error');
    return;
  }
  if (!confirm(`Khởi động thủ công tiến trình "${item.processName}"?`)) return;
  try {
    await api('/api/processes/launch', {
      method: 'POST',
      body: JSON.stringify({ processName: item.processName, filePath: item.filePath })
    });
    showToast(`Đang khởi động "${item.processName}"...`, 'success');
    // Refresh processes after a moment
    setTimeout(loadProcesses, 3000);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function editMonitored(idx) {
  const items = monitoredConfig.monitoredProcesses || [];
  openMonitoredModal(items[idx]);
}

function openMonitoredModal(item = null) {
  currentEditingMonitored = item;
  $('monitored-modal-title').textContent = item ? 'Edit Monitored Process' : 'Add Monitored Process';
  $('monitored-name').value = item ? item.processName : '';
  $('monitored-path').value = item ? (item.filePath || '') : '';
  $('monitored-enabled').checked = item ? item.enabled : true;
  $('monitored-modal').classList.add('active');
}

function closeMonitoredModal() {
  $('monitored-modal').classList.remove('active');
  currentEditingMonitored = null;
}

async function saveMonitored() {
  const name = $('monitored-name').value.trim();
  const filePath = $('monitored-path').value.trim();
  const enabled = $('monitored-enabled').checked;

  if (!name || !filePath) {
    showToast('Process name and file path are required', 'error');
    return;
  }

  const items = monitoredConfig.monitoredProcesses || [];
  const newItem = { processName: name, filePath, enabled };

  if (currentEditingMonitored !== null) {
    items[currentEditingMonitored] = newItem;
  } else {
    items.push(newItem);
  }

  try {
    await api('/api/config', {
      method: 'POST',
      body: JSON.stringify({ monitoredProcesses: items, discordWebhook: monitoredConfig.discordWebhook || '' })
    });
    monitoredConfig.monitoredProcesses = items;
    renderMonitored();
    closeMonitoredModal();
    showToast('Configuration saved', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeMonitored(idx) {
  if (!confirm('Remove this monitored process?')) return;
  const items = monitoredConfig.monitoredProcesses || [];
  items.splice(idx, 1);
  try {
    await api('/api/config', {
      method: 'POST',
      body: JSON.stringify({ monitoredProcesses: items, discordWebhook: monitoredConfig.discordWebhook || '' })
    });
    monitoredConfig.monitoredProcesses = items;
    renderMonitored();
    showToast('Configuration saved', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadHistory() {
  if (user.role !== 'admin') return;
  try {
    relaunchHistory = await api('/api/config/relaunch-history');
    const body = $('history-body');
    if (relaunchHistory.length === 0) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted)">No history yet</td></tr>';
      return;
    }
    body.innerHTML = relaunchHistory.slice().reverse().map(h => `
      <tr>
        <td><strong>${escapeHtml(h.processName)}</strong></td>
        <td><span class="badge ${h.status === 'relaunched' ? 'badge-running' : 'badge-down'}">${h.status === 'relaunched' ? 'Relaunched' : 'Failed'}</span></td>
        <td>${formatTime(new Date(h.lastAttempt).toISOString())}</td>
        <td>${escapeHtml(h.error || '-')}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

// ===== ADMIN / USERS =====
async function loadUsers() {
  try {
    const users = await api('/api/users');
    const body = $('users-body');
    body.innerHTML = users.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${u.role}</span></td>
        <td>
          <button class="btn btn-sm" onclick="openPasswordModal('${u.username}')">Set Password</button>
          ${u.username !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.username}')">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function openUserModal() {
  currentEditingUser = null;
  $('user-modal-title').textContent = 'Add User';
  $('user-username').value = '';
  $('user-password').value = '';
  $('user-role').value = 'user';
  $('user-modal').classList.add('active');
}

function closeUserModal() {
  $('user-modal').classList.remove('active');
}

async function saveUser() {
  const username = $('user-username').value.trim();
  const password = $('user-password').value;
  const role = $('user-role').value;

  if (!username || !password) {
    showToast('Username and password required', 'error');
    return;
  }

  try {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
    closeUserModal();
    loadUsers();
    showToast('User created', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser(username) {
  if (!confirm(`Delete user "${username}"?`)) return;
  try {
    await api(`/api/users/${username}`, { method: 'DELETE' });
    loadUsers();
    showToast('User deleted', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openPasswordModal(username) {
  currentPasswordUser = username;
  $('password-new').value = '';
  $('password-modal').classList.add('active');
}

async function savePassword() {
  const password = $('password-new').value;
  if (!password) {
    showToast('Password required', 'error');
    return;
  }
  try {
    await api(`/api/users/${currentPasswordUser}/password`, {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    $('password-modal').classList.remove('active');
    showToast('Password updated', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
  $('login-form').addEventListener('submit', login);
  $('logout-btn').addEventListener('click', logout);

  // Language switcher
  $('lang-en').addEventListener('click', () => setLanguage('en'));
  $('lang-vi').addEventListener('click', () => setLanguage('vi'));

  // Navigation
  window.addEventListener('hashchange', navigate);

  // Process search
  $('process-search').addEventListener('input', () => {
    // Debounce
    clearTimeout(window._searchTimeout);
    window._searchTimeout = setTimeout(() => {
      // Re-fetch processes filtered client-side
      loadProcesses();
    }, 300);
  });

  // Monitored modal
  $('add-monitored-btn').addEventListener('click', () => openMonitoredModal());
  $('monitored-cancel').addEventListener('click', closeMonitoredModal);
  $('monitored-save').addEventListener('click', saveMonitored);

  // Discord webhook
  $('save-webhook-btn').addEventListener('click', saveWebhook);

  // User modal
  $('add-user-btn').addEventListener('click', openUserModal);
  $('user-cancel').addEventListener('click', closeUserModal);
  $('user-save').addEventListener('click', saveUser);

  // Password modal
  $('password-cancel').addEventListener('click', () => $('password-modal').classList.remove('active'));
  $('password-save').addEventListener('click', savePassword);

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });

  // Load initial translations
  loadTranslations(currentLang);

  // Initial state
  if (token && user) {
    showApp();
  } else {
    $('login-page').style.display = 'flex';
  }
});
