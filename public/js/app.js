const state = {
  token: localStorage.getItem('wc_token') || '',
  user: (() => { try { return JSON.parse(localStorage.getItem('wc_user') || 'null'); } catch { return null; } })(),
  lang: localStorage.getItem('wc_lang') || 'vi',
  theme: localStorage.getItem('wc_theme') || document.documentElement.dataset.theme || 'light',
  translations: {},
  hosts: [],
  selectedHostId: new URLSearchParams(location.search).get('host'),
  processes: [],
  watchdog: { version: 0, rules: [] },
  socket: null,
  socketTimer: null
};

const $ = id => document.getElementById(id);
const pageMeta = {
  fleet: ['page.fleet.kicker', 'page.fleet.title'],
  dashboard: ['page.dashboard.kicker', 'page.dashboard.title'],
  processes: ['page.processes.kicker', 'page.processes.title'],
  watchdog: ['page.watchdog.kicker', 'page.watchdog.title'],
  activity: ['page.activity.kicker', 'page.activity.title'],
  admin: ['page.admin.kicker', 'page.admin.title']
};

function t(key, values = {}) {
  let value = state.translations[key] || key;
  return Object.entries(values).reduce((result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)), value);
}

function isSuperAdmin() {
  return state.user?.role === 'super_admin';
}

function canManageHosts() {
  return state.user?.role === 'super_admin' || state.user?.role === 'admin';
}

function roleLabel(role) {
  return t(role === 'super_admin' ? 'role.superAdmin' : role === 'admin' ? 'role.admin' : 'role.viewer');
}

async function loadTranslations(lang) {
  try {
    const response = await fetch(`lang/${lang}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error('translation_load_failed');
    state.translations = await response.json();
    state.lang = lang;
    localStorage.setItem('wc_lang', lang);
    applyTranslations();
  } catch (error) {
    if (lang !== 'en') return loadTranslations('en');
    console.error(error);
  }
}

function applyTranslations() {
  document.documentElement.lang = state.lang;
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  const language = $('language-select');
  if (language) language.value = state.lang;
  updateThemeControl();
  if (state.user) {
    $('session-role').textContent = roleLabel(state.user.role);
  }
  if (state.user && !$('app-shell').hidden) {
    const page = currentPage();
    $('page-kicker').textContent = t(pageMeta[page]?.[0] || pageMeta.fleet[0]);
    $('page-title').textContent = t(pageMeta[page]?.[1] || pageMeta.fleet[1]);
    renderHostSelect();
    renderFleet();
    renderDashboard();
    renderProcesses();
    renderWatchdog();
    loadActivity().catch(() => {});
    if (isSuperAdmin()) loadAdmin().catch(() => {});
  }
}

function applyTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem('wc_theme', state.theme);
  updateThemeControl();
}

function updateThemeControl() {
  const label = $('theme-label');
  if (!label) return;
  label.textContent = t(state.theme === 'dark' ? 'theme.switchToLight' : 'theme.switchToDark');
  $('theme-toggle').title = label.textContent;
}

function translateError(error) {
  const raw = error?.message || String(error || '');
  return t(`error.${raw}`) !== `error.${raw}` ? t(`error.${raw}`) : raw;
}

function statusLabel(status) {
  return t(`status.${status}`) === `status.${status}` ? status : t(`status.${status}`);
}

function commandLabel(type) {
  return t(`command.type.${type}`) === `command.type.${type}` ? type : t(`command.type.${type}`);
}

function eventLabel(type, fallback = '') {
  return t(`event.${type}`) === `event.${type}` ? (fallback || type) : t(`event.${type}`);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatTemperature(celsius) {
  const value = Number(celsius);
  return Number.isFinite(value) ? `${value.toFixed(1)} °C` : '--';
}

function formatWatts(watts) {
  const value = Number(watts);
  return Number.isFinite(value) ? `${value.toFixed(value >= 100 ? 0 : 1)} W` : '--';
}

function formatUptime(seconds) {
  const value = Number(seconds || 0);
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return state.lang === 'vi' ? `${days} ngày ${hours} giờ ${minutes} phút` : `${days}d ${hours}h ${minutes}m`;
}

function formatDate(value) {
  if (!value) return t('common.never');
  return new Date(value).toLocaleString(state.lang === 'vi' ? 'vi-VN' : 'en-US');
}

function clampPercent(value) {
  return Math.round(Math.max(0, Math.min(100, Number(value || 0))) * 10) / 10;
}

function formatPercent(value) {
  return `${clampPercent(value).toFixed(1)}%`;
}

function formatCpuDetail(cpu = {}) {
  const model = String(cpu.model || '').trim();
  const hasModel = model && !['undefined', 'null'].includes(model.toLowerCase());
  const cores = Number(cpu.cores);
  const hasCores = Number.isFinite(cores) && cores > 0;
  if (hasModel && hasCores) return t('dashboard.cpuDetail', { cores, model });
  if (hasModel) return model;
  if (hasCores) return t('dashboard.cpuCores', { cores });
  return t('dashboard.processorUnavailable');
}

function formatHostCpuModel(cpu = {}) {
  const raw = String(cpu.model || '').trim();
  if (!raw || /^(undefined|null|unknown|n\/a|home assistant host|x64|x86_64|arm64|aarch64)$/i.test(raw)) return '';
  return raw
    .replace(/\((?:R|TM)\)/gi, '')
    .replace(/^Intel\s+(?:Core|Xeon|Atom)(?:\s+CPU)?\s+/i, '')
    .replace(/\bCPU\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function initials(value) {
  return String(value || 'PC').split(/[\s_-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'PC';
}

function toast(message, type = '') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  $('toast-region').appendChild(item);
  setTimeout(() => item.remove(), 4200);
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    logout();
    throw new Error(t('error.sessionExpired'));
  }
  if (!response.ok) throw new Error(translateError(data.error || t('error.generic')));
  return data;
}

async function bootstrap() {
  await loadTranslations(state.lang);
  applyTheme(state.theme);
  const setup = await api('/api/setup/status');
  if (setup.required) return showOnly('setup-view');
  if (!state.token || !state.user) return showOnly('login-view');
  showApp();
}

function showOnly(id) {
  for (const view of ['setup-view', 'login-view', 'app-shell']) $(view).hidden = view !== id;
  document.body.classList.toggle('app-active', id === 'app-shell');
  const preferenceDock = document.querySelector('.preference-dock');
  if (id === 'app-shell') {
    document.querySelector('.topbar-actions').appendChild(preferenceDock);
  } else {
    document.body.insertBefore(preferenceDock, $(id));
  }
}

function showApp() {
  showOnly('app-shell');
  $('session-user').textContent = state.user.username;
  const sessionAvatar = document.querySelector('.session-avatar');
  if (sessionAvatar) sessionAvatar.textContent = initials(state.user.username).slice(0, 1);
  applyRoleVisibility();
  connectSocket();
  loadHosts().then(() => navigate());
  if (state.user.mustChangePassword) $('password-dialog').showModal();
}

function applyRoleVisibility() {
  $('session-role').textContent = roleLabel(state.user.role);
  document.querySelectorAll('[data-admin]').forEach(item => item.hidden = !canManageHosts());
  document.querySelectorAll('[data-super-admin]').forEach(item => item.hidden = !isSuperAdmin());
  if (!isSuperAdmin() && location.hash === '#admin') location.hash = '#fleet';
}

function logout() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('wc_token');
  localStorage.removeItem('wc_user');
  clearTimeout(state.socketTimer);
  if (state.socket) state.socket.close();
  showOnly('login-view');
}

async function setupSubmit(event) {
  event.preventDefault();
  try {
    await api('/api/setup', { method: 'POST', body: JSON.stringify({ username: $('setup-username').value.trim(), password: $('setup-password').value }) });
    showOnly('login-view');
    $('login-username').value = $('setup-username').value.trim();
    toast(t('setup.success'), 'success');
  } catch (error) {
    $('setup-error').textContent = translateError(error);
  }
}

async function loginSubmit(event) {
  event.preventDefault();
  $('login-error').textContent = '';
  try {
    const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: $('login-username').value.trim(), password: $('login-password').value }) });
    state.token = result.token;
    state.user = { username: result.username, role: result.role, mustChangePassword: result.mustChangePassword };
    localStorage.setItem('wc_token', state.token);
    localStorage.setItem('wc_user', JSON.stringify(state.user));
    showApp();
  } catch (error) {
    $('login-error').textContent = translateError(error);
  }
}

function connectSocket() {
  if (!state.token) return;
  clearTimeout(state.socketTimer);
  if (state.socket) state.socket.close();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.socket = new WebSocket(`${protocol}//${location.host}/ws/ui?token=${encodeURIComponent(state.token)}`);
  state.socket.onopen = () => {
    $('socket-status').classList.add('connected');
    $('socket-status-text').textContent = t('socket.live');
    subscribeSelectedHost();
  };
  state.socket.onmessage = event => handleSocketMessage(JSON.parse(event.data));
  state.socket.onclose = () => {
    $('socket-status').classList.remove('connected');
    $('socket-status-text').textContent = t('socket.reconnecting');
    state.socketTimer = setTimeout(connectSocket, 3000);
  };
}

function subscribeSelectedHost() {
  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ type: 'ui.subscribe', payload: { agentId: state.selectedHostId } }));
  }
}

function handleSocketMessage(message) {
  if (message.type === 'ui.telemetry') {
    const host = state.hosts.find(item => item.id === message.agentId);
    if (host) { host.telemetry = message.payload; host.online = true; host.lastSeen = message.sentAt; }
    if (host) updateFleetHostCard(host);
    updateFleetSummary();
    if (message.agentId === state.selectedHostId) renderDashboard();
  } else if (message.type === 'ui.processes' && message.agentId === state.selectedHostId) {
    state.processes = message.payload?.processes || [];
    renderProcesses();
  } else if (message.type === 'ui.access.changed') {
    state.user.role = message.payload?.role || state.user.role;
    localStorage.setItem('wc_user', JSON.stringify(state.user));
    applyRoleVisibility();
    loadHosts().then(() => navigate());
  } else if (message.type === 'ui.host.status' || message.type === 'ui.agent.pending') {
    loadHosts();
    if (isSuperAdmin()) loadAdmin();
  } else if (message.type === 'ui.event' && message.agentId === state.selectedHostId) {
    loadActivity();
    toast(eventLabel(message.payload?.eventType, message.payload?.message), message.payload?.severity === 'error' ? 'error' : '');
  } else if (message.type === 'ui.command' && message.agentId === state.selectedHostId) {
    loadActivity();
    if (message.payload?.status === 'failed') toast(translateError(message.payload.error || t('command.failed')), 'error');
    if (message.payload?.status === 'expired') toast(t('command.expired'), 'error');
    if (message.payload?.status === 'succeeded') toast(t('command.completed'), 'success');
  }
}

async function loadHosts() {
  state.hosts = await api('/api/v1/hosts');
  if (!state.hosts.some(host => host.id === state.selectedHostId)) state.selectedHostId = state.hosts[0]?.id || null;
  updateHostQuery();
  renderHostSelect();
  renderFleet();
  renderDashboard();
}

function updateHostQuery() {
  const url = new URL(location.href);
  if (state.selectedHostId) url.searchParams.set('host', state.selectedHostId);
  else url.searchParams.delete('host');
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function renderHostSelect() {
  $('host-select').innerHTML = state.hosts.length
    ? state.hosts.map(host => `<option value="${host.id}" ${host.id === state.selectedHostId ? 'selected' : ''}>${escapeHtml(host.displayName)}${host.online ? '' : ` (${escapeHtml(t('common.offline'))})`}</option>`).join('')
    : `<option value="">${escapeHtml(t('host.none'))}</option>`;
  $('host-select').setAttribute('aria-label', t('host.selector'));
  $('host-select').disabled = state.hosts.length === 0;
  const online = state.hosts.filter(host => host.online).length;
  $('online-count').textContent = online;
  $('offline-count').textContent = state.hosts.length - online;
  updateCapabilityNavigation();
}

function selectedHost() {
  return state.hosts.find(host => host.id === state.selectedHostId) || null;
}

function selectedHostSupports(...capabilities) {
  const available = new Set(selectedHost()?.capabilities || []);
  return capabilities.some(capability => available.has(capability));
}

function updateCapabilityNavigation() {
  document.querySelectorAll('#main-nav [data-capability]').forEach(link => {
    link.hidden = !selectedHostSupports(link.dataset.capability);
  });
  const page = currentPage();
  const currentLink = document.querySelector(`#main-nav [data-page="${CSS.escape(page)}"]`);
  if (currentLink?.hidden) location.hash = '#dashboard';
}

function selectHost(hostId, destination = null) {
  state.selectedHostId = hostId;
  updateHostQuery();
  renderHostSelect();
  renderDashboard();
  subscribeSelectedHost();
  if (destination) location.hash = destination;
  else refreshCurrentPage();
}

function hostNeedsAttention(host) {
  return !host.online || Number(host.telemetry?.cpu?.usage || 0) >= 85 || Number(host.telemetry?.memory?.percent || 0) >= 90;
}

function updateFleetSummary() {
  const onlineCount = state.hosts.filter(host => host.online).length;
  const attentionCount = state.hosts.filter(hostNeedsAttention).length;
  if ($('fleet-total')) $('fleet-total').textContent = state.hosts.length;
  if ($('fleet-health')) $('fleet-health').textContent = state.hosts.length ? `${Math.round((onlineCount / state.hosts.length) * 100)}%` : '--';
  if ($('fleet-attention')) $('fleet-attention').textContent = attentionCount;
  $('online-count').textContent = onlineCount;
  $('offline-count').textContent = state.hosts.length - onlineCount;
}

function updateFleetHostCard(host) {
  const card = [...document.querySelectorAll('.host-card')].find(item => item.dataset.host === host.id);
  if (!card) return renderFleet();
  const cpu = clampPercent(host.telemetry?.cpu?.usage);
  const memory = clampPercent(host.telemetry?.memory?.percent);
  const hasCpu = Boolean(host.telemetry?.cpu);
  const hasMemory = Boolean(host.telemetry?.memory);
  const totalWatts = host.telemetry?.hardware?.power?.totalWatts;
  const hasPower = totalWatts !== null && totalWatts !== undefined && Number.isFinite(Number(totalWatts));
  const metrics = card.querySelector('.host-metrics');
  const powerMetric = card.querySelector('.host-metric.power');
  const status = card.querySelector('[data-role="status"]');
  card.classList.toggle('online', host.online);
  card.classList.toggle('attention', host.online && hostNeedsAttention(host));
  status.classList.toggle('online', host.online);
  status.textContent = host.online ? t('common.online') : t('common.offline');
  card.querySelector('[data-role="cpu-value"]').textContent = hasCpu ? formatPercent(cpu) : '--';
  card.querySelector('[data-role="memory-value"]').textContent = hasMemory ? formatPercent(memory) : '--';
  const memoryDetail = card.querySelector('[data-role="memory-detail"]');
  const hasMemoryCapacity = Number(host.telemetry?.memory?.total) > 0;
  if (memoryDetail) {
    memoryDetail.hidden = !hasMemoryCapacity;
    memoryDetail.textContent = hasMemoryCapacity ? `${formatBytes(host.telemetry.memory.used)} / ${formatBytes(host.telemetry.memory.total)}` : '';
  }
  const uptime = card.querySelector('[data-role="uptime"]');
  if (uptime) uptime.textContent = host.telemetry?.uptime !== undefined ? formatUptime(host.telemetry.uptime) : '--';
  const cpuModel = formatHostCpuModel(host.telemetry?.cpu);
  const cpuModelElement = card.querySelector('[data-role="cpu-model"]');
  if (cpuModelElement) {
    cpuModelElement.hidden = !cpuModel;
    cpuModelElement.textContent = cpuModel;
    cpuModelElement.title = cpuModel;
  }
  metrics?.classList.toggle('has-power', hasPower);
  if (powerMetric) powerMetric.hidden = !hasPower;
  if (hasPower && card.querySelector('[data-role="power-value"]')) card.querySelector('[data-role="power-value"]').textContent = formatWatts(totalWatts);
  card.querySelector('[data-role="last-seen"]').textContent = t('fleet.lastSeen', { time: formatDate(host.lastSeen) });
  card.setAttribute('aria-label', `${host.displayName}, ${host.online ? t('common.online') : t('common.offline')}, CPU ${hasCpu ? formatPercent(cpu) : '--'}, ${t('fleet.memory')} ${hasMemory ? formatPercent(memory) : '--'}${hasPower ? `, ${t('fleet.power')} ${formatWatts(totalWatts)}` : ''}`);
}

function renderFleet() {
  updateFleetSummary();
  $('fleet-empty').hidden = state.hosts.length > 0;
  $('fleet-grid').innerHTML = state.hosts.map((host, index) => {
    const telemetry = host.telemetry || {};
    const cpu = clampPercent(telemetry.cpu?.usage);
    const memory = clampPercent(telemetry.memory?.percent);
    const totalWatts = telemetry.hardware?.power?.totalWatts;
    const hasPower = totalWatts !== null && totalWatts !== undefined && Number.isFinite(Number(totalWatts));
    const cpuModel = formatHostCpuModel(telemetry.cpu);
    const needsAttention = hostNeedsAttention(host);
    const cardLabel = `${host.displayName}, ${host.online ? t('common.online') : t('common.offline')}, CPU ${telemetry.cpu ? formatPercent(cpu) : '--'}, ${t('fleet.memory')} ${telemetry.memory ? formatPercent(memory) : '--'}${hasPower ? `, ${t('fleet.power')} ${formatWatts(totalWatts)}` : ''}`;
    return `<article class="host-card ${host.online ? 'online' : ''} ${needsAttention && host.online ? 'attention' : ''}" data-host="${host.id}" tabindex="0" role="button" aria-label="${escapeHtml(cardLabel)}" style="animation-delay:${index * 35}ms">
      <div class="host-card-main">
        <div class="host-head"><div class="host-identity"><h3>${escapeHtml(host.displayName)}</h3></div><span class="status-pill ${host.online ? 'online' : ''}" data-role="status">${host.online ? escapeHtml(t('common.online')) : escapeHtml(t('common.offline'))}</span></div>
        <p class="host-meta">${escapeHtml(host.platform || 'Windows')} / Agent ${escapeHtml(host.version || '--')}</p>
        <div class="host-runtime"><span>${escapeHtml(t('fleet.uptime'))}</span><strong data-role="uptime">${telemetry.uptime !== undefined ? escapeHtml(formatUptime(telemetry.uptime)) : '--'}</strong></div>
      </div>
      <div class="host-metrics ${hasPower ? 'has-power' : ''}"><div class="host-metric"><header><span>${escapeHtml(t('fleet.cpu'))}</span><span>CPU</span></header><strong data-role="cpu-value">${telemetry.cpu ? formatPercent(cpu) : '--'}</strong><small class="cpu-model" data-role="cpu-model" title="${escapeHtml(cpuModel)}" ${cpuModel ? '' : 'hidden'}>${cpuModel ? escapeHtml(cpuModel) : ''}</small></div><div class="host-metric memory"><header><span>${escapeHtml(t('fleet.memory'))}</span><span>RAM</span></header><strong data-role="memory-value">${telemetry.memory ? formatPercent(memory) : '--'}</strong><small data-role="memory-detail" ${Number(telemetry.memory?.total) > 0 ? '' : 'hidden'}>${Number(telemetry.memory?.total) > 0 ? `${formatBytes(telemetry.memory.used)} / ${formatBytes(telemetry.memory.total)}` : ''}</small></div><div class="host-metric power" ${hasPower ? '' : 'hidden'}><header><span>${escapeHtml(t('fleet.power'))}</span><span>W</span></header><strong data-role="power-value">${hasPower ? formatWatts(totalWatts) : '--'}</strong></div></div>
      <footer class="host-footer"><span data-role="last-seen">${escapeHtml(t('fleet.lastSeen', { time: formatDate(host.lastSeen) }))}</span></footer>
    </article>`;
  }).join('');
  document.querySelectorAll('.host-card').forEach(card => {
    card.addEventListener('click', () => selectHost(card.dataset.host, '#dashboard'));
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectHost(card.dataset.host, '#dashboard');
    });
  });
}

function setMetricState(element, value) {
  element.classList.remove('warning', 'danger');
  if (value >= 95) element.classList.add('danger');
  else if (value >= 85) element.classList.add('warning');
}

function drawSparkline(svg, values, memory = false) {
  if (!values.length) return svg.innerHTML = '';
  const width = 100;
  const height = 32;
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * width},${height - (Math.max(0, Math.min(100, value)) / 100) * height}`).join(' ');
  svg.innerHTML = `<path class="spark-area" d="M0,${height} L${points.split(' ').join(' L')} L${width},${height} Z"></path><polyline points="${points}"></polyline>`;
}

function updateHero(host, telemetry, hardware) {
  if ($('hero-glyph')) $('hero-glyph').textContent = initials(host?.displayName || '--').slice(0, 2);
  if ($('hero-hostname')) $('hero-hostname').textContent = host?.hostname || '--';
  if ($('hero-cpu')) $('hero-cpu').textContent = telemetry?.cpu ? formatPercent(telemetry.cpu.usage) : '--';
  if ($('hero-ram')) $('hero-ram').textContent = telemetry?.memory ? formatPercent(telemetry.memory.percent) : '--';
  if ($('hero-uptime')) $('hero-uptime').textContent = telemetry?.uptime ? formatUptime(telemetry.uptime) : '--';
  const hottest = Array.isArray(hardware?.temperatures) ? hardware.temperatures.reduce((skip, sensor) => !skip || Number(sensor.celsius) > Number(skip.celsius) ? sensor : skip, null) : null;
  if ($('hero-temp')) $('hero-temp').textContent = hottest ? formatTemperature(hottest.celsius) : '--';
  if ($('hero-power')) $('hero-power').textContent = hardware?.power?.totalWatts !== null && hardware?.power?.totalWatts !== undefined ? formatWatts(hardware.power.totalWatts) : '--';
}

function renderDashboard() {
  const host = selectedHost();
  const telemetry = host?.telemetry;
  const hardware = telemetry?.hardware || null;
  updateHero(host, telemetry, hardware);
  if (!host || !telemetry) {
    for (const id of ['cpu-value', 'memory-value', 'uptime-value', 'network-value', 'temperature-value', 'power-value']) $(id).textContent = '--';
    $('cpu-model').textContent = t('dashboard.waiting');
    $('memory-detail').textContent = t('dashboard.waiting');
    $('os-value').textContent = t('dashboard.waiting');
    $('network-detail').textContent = t('dashboard.sendReceive');
    $('temperature-detail').textContent = t('dashboard.sensorUnavailable');
    $('power-detail').textContent = t('dashboard.sensorUnavailable');
    $('hardware-coverage').textContent = t('dashboard.hardwarePartial');
    $('hardware-sensor-list').innerHTML = `<p>${escapeHtml(t('dashboard.noHardwareSensors'))}</p>`;
    $('host-status-badge').textContent = t('common.offline');
    $('host-status-badge').classList.remove('online');
    if ($('dashboard-host-name')) $('dashboard-host-name').textContent = host?.displayName || '--';
    if ($('host-updated-at')) $('host-updated-at').textContent = t('dashboard.waiting');
    $('machine-details').innerHTML = `<dt>${escapeHtml(t('machine.status'))}</dt><dd>${escapeHtml(t('machine.waiting'))}</dd>`;
    $('disk-list').innerHTML = '';
    return;
  }
  $('cpu-value').textContent = formatPercent(telemetry.cpu.usage);
  $('cpu-model').textContent = formatCpuDetail(telemetry.cpu);
  $('memory-value').textContent = formatPercent(telemetry.memory.percent);
  $('memory-detail').textContent = t('dashboard.memoryUsage', { used: formatBytes(telemetry.memory.used), total: formatBytes(telemetry.memory.total) });
  $('uptime-value').textContent = formatUptime(telemetry.uptime);
  $('os-value').textContent = telemetry.os;
  $('network-value').textContent = `${formatBytes(telemetry.network.recvPerSecond)}/s`;
  $('network-detail').textContent = t('dashboard.sentRate', { rate: formatBytes(telemetry.network.sentPerSecond) });
  renderHardware(hardware);
  $('host-status-badge').textContent = host.online ? t('common.online') : t('common.offline');
  $('host-status-badge').classList.toggle('online', host.online);
  if ($('dashboard-host-name')) $('dashboard-host-name').textContent = host.displayName;
  if ($('host-updated-at')) $('host-updated-at').textContent = t('dashboard.updatedAt', { time: formatDate(host.lastSeen) });
  setMetricState($('cpu-value').closest('.metric'), Number(telemetry.cpu.usage));
  setMetricState($('memory-value').closest('.metric'), Number(telemetry.memory.percent));
  const homeAssistantDetails = telemetry.homeAssistant
    ? `<dt>${escapeHtml(t('machine.homeAssistantVersion'))}</dt><dd>${escapeHtml(telemetry.homeAssistant.version || '--')}</dd><dt>${escapeHtml(t('machine.entityCount'))}</dt><dd>${escapeHtml(telemetry.homeAssistant.entityCount ?? '--')}</dd><dt>${escapeHtml(t('machine.unavailableEntities'))}</dt><dd>${escapeHtml(telemetry.homeAssistant.unavailableEntityCount ?? '--')}</dd>`
    : '';
  $('machine-details').innerHTML = `<dt>${escapeHtml(t('machine.displayName'))}</dt><dd>${escapeHtml(host.displayName)}</dd><dt>${escapeHtml(t('machine.hostname'))}</dt><dd>${escapeHtml(host.hostname)}</dd><dt>${escapeHtml(t('machine.platform'))}</dt><dd>${escapeHtml(host.platform)}</dd><dt>${escapeHtml(t('machine.agentVersion'))}</dt><dd>${escapeHtml(host.version)}</dd><dt>${escapeHtml(t('machine.lastSeen'))}</dt><dd>${escapeHtml(formatDate(host.lastSeen))}</dd><dt>${escapeHtml(t('machine.fingerprint'))}</dt><dd>${escapeHtml(host.fingerprint)}</dd>${homeAssistantDetails}`;
  $('disk-list').innerHTML = (telemetry.disk || []).map(disk => {
    const percent = clampPercent(disk.total ? (disk.used / disk.total) * 100 : 0);
    const stateClass = percent >= 90 ? ' danger' : percent >= 80 ? ' warning' : '';
    return `<div class="disk-row${stateClass}"><header><strong>${escapeHtml(disk.drive)}</strong><span>${formatBytes(disk.used)} / ${formatBytes(disk.total)} (${formatPercent(percent)})</span></header><div class="bar"><i style="width:${percent}%"></i></div></div>`;
  }).join('') || `<p>${escapeHtml(t('dashboard.noDisks'))}</p>`;
}

function tempState(celsius) {
  const value = Number(celsius);
  if (!Number.isFinite(value)) return '';
  if (value >= 85) return ' hot';
  if (value >= 70) return ' warm';
  return '';
}

function renderHardware(hardware) {
  const temperatures = Array.isArray(hardware?.temperatures) ? hardware.temperatures : [];
  const powerParts = Array.isArray(hardware?.power?.parts) ? hardware.power.parts : [];
  const hottest = temperatures.reduce((current, sensor) => !current || Number(sensor.celsius) > Number(current.celsius) ? sensor : current, null);
  $('temperature-value').textContent = hottest ? formatTemperature(hottest.celsius) : '--';
  $('temperature-detail').textContent = hottest?.name || t('dashboard.sensorUnavailable');
  const tempMetric = $('temperature-value').closest('.metric');
  if (tempMetric) setMetricState(tempMetric, Number(hottest?.celsius || 0) >= 85 ? 85 : Number(hottest?.celsius || 0));
  $('power-value').textContent = hardware?.power?.totalWatts !== null && hardware?.power?.totalWatts !== undefined
    ? formatWatts(hardware.power.totalWatts)
    : '--';
  $('power-detail').textContent = powerParts.length
    ? t('dashboard.powerPartsMeasured', { count: powerParts.length })
    : t('dashboard.sensorUnavailable');
  $('hardware-coverage').textContent = hardware?.power?.coverage === 'system-meter'
    ? t('dashboard.hardwareSystemMeter')
    : (hardware?.power?.coverage === 'complete' ? t('dashboard.hardwareComplete') : t('dashboard.hardwarePartial'));

  const components = new Map();
  for (const sensor of temperatures) components.set(sensor.id, { ...sensor });
  for (const part of powerParts) components.set(part.id, { ...(components.get(part.id) || {}), ...part });
  $('hardware-sensor-list').innerHTML = components.size
    ? [...components.values()].map(component => `<article class="sensor-card ${escapeHtml(component.type || '')}">
      <header><h4>${escapeHtml(component.name || component.id)}</h4><span>${escapeHtml(t(`hardware.type.${component.type}`) === `hardware.type.${component.type}` ? component.type : t(`hardware.type.${component.type}`))}</span></header>
      <div class="sensor-values"><div class="temp${tempState(component.celsius)}"><span>${escapeHtml(t('hardware.temperature'))}</span><strong>${escapeHtml(formatTemperature(component.celsius))}</strong></div><div><span>${escapeHtml(t('hardware.power'))}</span><strong>${escapeHtml(formatWatts(component.watts))}</strong></div></div>
      ${component.limitWatts !== null && component.limitWatts !== undefined ? `<p class="sensor-source">${escapeHtml(t('hardware.powerLimit', { value: formatWatts(component.limitWatts) }))}</p>` : ''}
      <p class="sensor-source">${escapeHtml(t('hardware.source', { source: component.source || 'unknown' }))}</p>
    </article>`).join('')
    : `<p>${escapeHtml(t('dashboard.noHardwareSensors'))}</p>`;
}

async function loadTelemetryHistory() {
  if (!state.selectedHostId) return;
  const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const points = await api(`/api/v1/hosts/${state.selectedHostId}/telemetry?from=${encodeURIComponent(from)}&limit=1000`);
  const cpuValues = points.map(point => Number(point.cpu?.usage || 0));
  const memoryValues = points.map(point => Number(point.memory?.percent || 0));
  drawLine($('cpu-chart'), cpuValues, 'cpu');
  drawLine($('memory-chart'), memoryValues, 'memory');
  drawSparkline($('cpu-spark'), cpuValues);
  drawSparkline($('memory-spark'), memoryValues, true);
  if ($('cpu-chart-max')) $('cpu-chart-max').textContent = cpuValues.length ? formatPercent(Math.max(...cpuValues)) : '--';
  if ($('memory-chart-max')) $('memory-chart-max').textContent = memoryValues.length ? formatPercent(Math.max(...memoryValues)) : '--';
}

function buildChartSvg(values, metric) {
  if (!values.length) return '';
  const width = 800;
  const height = 240;
  const axis = [0, 50, 100].map(level => {
    const y = height - (level / 100) * height;
    return `<line class="chart-axis" x1="0" y1="${y}" x2="${width}" y2="${y}"></line><text class="chart-axis-label" x="4" y="${y - 4}">${level}%</text>`;
  }).join('');
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * width},${height - (Math.max(0, Math.min(100, value)) / 100) * height}`).join(' ');
  const area = `<path class="chart-area" d="M0,${height} L${points.split(' ').join(' L')} L${width},${height} Z"></path>`;
  const last = values[values.length - 1];
  const lastX = width;
  const lastY = height - (Math.max(0, Math.min(100, last)) / 100) * height;
  const dot = `<circle class="chart-dot" cx="${lastX}" cy="${lastY}" r="4"></circle>`;
  return `${axis}${area}<polyline class="chart-line" points="${points}"></polyline>${dot}`;
}

function drawLine(svg, values, metric = 'cpu') {
  svg.innerHTML = buildChartSvg(values, metric);
  const zone = svg.closest('.chart-zone');
  const tooltipId = metric === 'memory' ? 'memory-tooltip' : 'cpu-tooltip';
  const tooltip = zone?.querySelector(`#${tooltipId}`);
  if (!zone || !tooltip) return;
  zone.addEventListener('mousemove', event => {
    if (!values.length) return;
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const index = Math.round(ratio * (values.length - 1));
    const value = values[index];
    tooltip.textContent = `${metric === 'memory' ? 'RAM' : 'CPU'}: ${formatPercent(value)}`;
    tooltip.hidden = false;
    tooltip.style.left = `${ratio * 100}%`;
    tooltip.style.top = `${Math.max(0, 100 - (Math.max(0, Math.min(100, value)) / 100) * 100)}%`;
  });
  zone.addEventListener('mouseleave', () => { tooltip.hidden = true; });
}

async function loadProcesses() {
  if (!state.selectedHostId) return;
  const result = await api(`/api/v1/hosts/${state.selectedHostId}/processes`);
  state.processes = result.processes || [];
  renderProcesses();
  if (result.commandId) toast(t('process.refreshRequested'));
}

function renderProcesses() {
  if (!selectedHostSupports('processes')) {
    if ($('process-count')) $('process-count').textContent = '0';
    $('process-body').innerHTML = `<tr><td colspan="6">${escapeHtml(t('process.unsupported'))}</td></tr>`;
    return;
  }
  const query = $('process-search').value.trim().toLowerCase();
  const rows = state.processes.filter(process => !query || process.name.toLowerCase().includes(query) || (process.path || '').toLowerCase().includes(query));
  if ($('process-count')) $('process-count').textContent = rows.length;
  const canCapture = canManageHosts() && selectedHostSupports('window.capture', 'desktop-helper');
  const canKill = canManageHosts() && selectedHostSupports('process.kill', 'processes');
  $('process-body').innerHTML = rows.length ? rows.map(process => `<tr><td><div class="process-name"><span class="process-glyph">${escapeHtml(initials(process.name).slice(0, 1))}</span><strong>${escapeHtml(process.name)}</strong></div></td><td>${process.pid}</td><td>${Number(process.cpuPercent || 0).toFixed(1)}%</td><td>${Number(process.memoryMB || 0).toFixed(1)} MB</td><td class="path" title="${escapeHtml(process.path)}">${escapeHtml(process.path || '-')}</td><td><div class="row-actions">${canCapture ? `<button class="button compact capture-process" type="button" data-name="${escapeHtml(process.name)}">${escapeHtml(t('process.capture'))}</button>` : ''}${canKill ? `<button class="button compact danger kill-process" type="button" data-pid="${process.pid}" data-name="${escapeHtml(process.name)}">${escapeHtml(t('process.kill'))}</button>` : ''}</div></td></tr>`).join('') : `<tr><td colspan="6">${escapeHtml(t('process.none'))}</td></tr>`;
  document.querySelectorAll('.kill-process').forEach(button => button.addEventListener('click', () => killRemoteProcess(button.dataset.pid, button.dataset.name)));
  document.querySelectorAll('.capture-process').forEach(button => button.addEventListener('click', () => sendCommand('window.capture', { processName: button.dataset.name })));
}

async function killRemoteProcess(pid, name) {
  if (!confirm(t('process.killConfirm', { name, pid }))) return;
  await sendCommand('process.kill', { pid: Number(pid) });
}

async function sendCommand(type, payload) {
  try {
    await api(`/api/v1/hosts/${state.selectedHostId}/commands`, { method: 'POST', body: JSON.stringify({ type, payload }) });
    toast(t('command.queued'), 'success');
    setTimeout(loadActivity, 500);
  } catch (error) {
    toast(translateError(error), 'error');
  }
}

async function loadWatchdog() {
  if (!state.selectedHostId) return;
  state.watchdog = await api(`/api/v1/hosts/${state.selectedHostId}/watchdog`);
  renderWatchdog();
}

function renderWatchdog() {
  const supported = selectedHostSupports('watchdog');
  $('add-rule-button').hidden = !canManageHosts() || !supported;
  if (!supported) {
    if ($('rule-count')) $('rule-count').textContent = '0';
    $('rule-list').innerHTML = `<div class="empty-state"><span class="empty-icon">--</span><h3>${escapeHtml(t('watchdog.unsupported'))}</h3></div>`;
    return;
  }
  if ($('rule-count')) $('rule-count').textContent = state.watchdog.rules.length;
  $('rule-list').innerHTML = state.watchdog.rules.length ? state.watchdog.rules.map(rule => `<article class="rule-card ${rule.enabled ? 'enabled' : ''}"><div><div class="rule-title"><h3>${escapeHtml(rule.processName)}</h3><span class="status-pill ${rule.enabled ? 'online' : ''}">${escapeHtml(t(rule.enabled ? 'watchdog.enabled' : 'watchdog.disabled'))}</span></div><p class="rule-meta"><span><i></i>${escapeHtml(t(rule.runMode === 'service' ? 'watchdog.service' : 'watchdog.interactive'))}</span><span><i></i>${escapeHtml(rule.captureAfterLaunch === false ? t('watchdog.captureDisabled') : t('watchdog.captureEnabled'))}</span><span><i></i>${escapeHtml(rule.filePath || t('common.pathHidden'))}</span></p></div><div class="row-actions">${canManageHosts() ? `<button class="button primary compact launch-rule" type="button" data-id="${rule.id}">${escapeHtml(t('watchdog.launch'))}</button><button class="button compact edit-rule" type="button" data-id="${rule.id}">${escapeHtml(t('common.edit'))}</button><button class="button compact danger delete-rule" type="button" data-id="${rule.id}">${escapeHtml(t('common.delete'))}</button>` : ''}</div></article>`).join('') : `<div class="empty-state"><span class="empty-icon">00</span><h3>${escapeHtml(t('watchdog.emptyTitle'))}</h3><p>${escapeHtml(t('watchdog.emptyDescription'))}</p></div>`;
  document.querySelectorAll('.launch-rule').forEach(button => button.addEventListener('click', () => sendCommand('watchdog.launch', { ruleId: button.dataset.id })));
  document.querySelectorAll('.edit-rule').forEach(button => button.addEventListener('click', () => openRuleDialog(button.dataset.id)));
  document.querySelectorAll('.delete-rule').forEach(button => button.addEventListener('click', () => deleteRule(button.dataset.id)));
}

function openRuleDialog(ruleId = null) {
  const rule = state.watchdog.rules.find(item => item.id === ruleId);
  $('rule-dialog-title').textContent = t(rule ? 'watchdog.editTitle' : 'watchdog.addTitle');
  $('rule-id').value = rule?.id || '';
  $('rule-name').value = rule?.processName || '';
  $('rule-path').value = rule?.filePath || '';
  $('rule-mode').value = rule?.runMode || 'interactive';
  const interactiveSupported = selectedHostSupports('desktop-helper');
  $('rule-mode').querySelector('option[value="interactive"]').disabled = !interactiveSupported;
  if (!interactiveSupported && $('rule-mode').value === 'interactive') $('rule-mode').value = 'service';
  $('rule-enabled').checked = rule?.enabled !== false;
  $('rule-screenshot').checked = rule?.captureAfterLaunch !== false;
  const captureSupported = selectedHostSupports('window.capture', 'desktop-helper');
  $('rule-screenshot').disabled = !captureSupported;
  if (!captureSupported) $('rule-screenshot').checked = false;
  $('rule-dialog').showModal();
}

async function saveRule(event) {
  event.preventDefault();
  const ruleId = $('rule-id').value || crypto.randomUUID();
  const rule = { id: ruleId, processName: $('rule-name').value.trim(), filePath: $('rule-path').value.trim(), runMode: $('rule-mode').value, enabled: $('rule-enabled').checked, captureAfterLaunch: $('rule-screenshot').checked };
  const rules = state.watchdog.rules.filter(item => item.id !== ruleId).concat(rule);
  try {
    state.watchdog = await api(`/api/v1/hosts/${state.selectedHostId}/watchdog`, { method: 'PUT', body: JSON.stringify({ rules }) });
    $('rule-dialog').close();
    renderWatchdog();
    toast(t('watchdog.configSent'), 'success');
  } catch (error) { toast(translateError(error), 'error'); }
}

async function deleteRule(ruleId) {
  if (!confirm(t('watchdog.deleteConfirm'))) return;
  const rules = state.watchdog.rules.filter(item => item.id !== ruleId);
  state.watchdog = await api(`/api/v1/hosts/${state.selectedHostId}/watchdog`, { method: 'PUT', body: JSON.stringify({ rules }) });
  renderWatchdog();
}

async function loadActivity() {
  if (!state.selectedHostId) return;
  const [events, commands] = await Promise.all([
    api(`/api/v1/hosts/${state.selectedHostId}/events`),
    api(`/api/v1/hosts/${state.selectedHostId}/commands`)
  ]);
  $('event-list').innerHTML = events.length ? events.map(event => `<div class="timeline-item ${escapeHtml(event.severity)}"><h4>${escapeHtml(eventLabel(event.type, event.payload.message))}</h4><p>${escapeHtml(event.type)}</p><time>${escapeHtml(formatDate(event.occurredAt))}</time></div>`).join('') : `<p>${escapeHtml(t('activity.noEvents'))}</p>`;
  $('command-list').innerHTML = commands.length ? commands.map(command => `<div class="timeline-item ${escapeHtml(command.status)}"><h4>${escapeHtml(commandLabel(command.type))} / ${escapeHtml(statusLabel(command.status))}</h4><p>${escapeHtml(t('activity.requestedBy', { user: command.requestedBy }))}${command.result?.error ? ` / ${escapeHtml(translateError(new Error(command.result.error)))}` : ''}</p><time>${escapeHtml(formatDate(command.requestedAt))}</time></div>`).join('') : `<p>${escapeHtml(t('activity.noCommands'))}</p>`;
}

async function loadAdmin() {
  if (!isSuperAdmin()) return;
  const [agents, pending, users, settings] = await Promise.all([api('/api/v1/agents'), api('/api/v1/agents/pending'), api('/api/v1/users'), api('/api/v1/settings')]);
  $('agent-list').innerHTML = agents.length ? agents.map(agent => {
    const status = agent.status === 'approved' ? (agent.online ? 'online' : 'offline') : agent.status;
    const statusText = t(`agent.status.${status}`);
    const actions = [
      `<button class="button compact edit-agent" data-id="${agent.id}">${escapeHtml(t('common.edit'))}</button>`,
      agent.status !== 'revoked' ? `<button class="button danger compact revoke-agent" data-id="${agent.id}" data-name="${escapeHtml(agent.displayName || agent.hostname)}">${escapeHtml(t('admin.revokeAgent'))}</button>` : ''
    ].join('');
    return `<article class="agent-record ${escapeHtml(agent.status)}"><div class="agent-record-head"><div><span class="panel-label">${escapeHtml(agent.platform || 'Agent')}</span><h4>${escapeHtml(agent.displayName || agent.hostname)}</h4><p>${escapeHtml(agent.hostname)}</p></div><span class="status-pill ${status === 'online' ? 'online' : ''}">${escapeHtml(statusText)}</span></div><dl class="agent-record-details"><div><dt>${escapeHtml(t('agent.version'))}</dt><dd>${escapeHtml(agent.version || '--')}</dd></div><div><dt>${escapeHtml(t('agent.lastSeen'))}</dt><dd>${escapeHtml(formatDate(agent.lastSeen))}</dd></div><div><dt>${escapeHtml(t('agent.fingerprint'))}</dt><dd title="${escapeHtml(agent.fingerprint)}">${escapeHtml(agent.fingerprint ? `${agent.fingerprint.slice(0, 16)}…` : '--')}</dd></div></dl>${agent.notes ? `<p class="agent-notes">${escapeHtml(agent.notes)}</p>` : ''}<div class="row-actions agent-record-actions">${actions}</div></article>`;
  }).join('') : `<p>${escapeHtml(t('admin.noAgents'))}</p>`;
  $('pending-list').innerHTML = pending.length ? pending.map(agent => `<div class="stack-item"><div><h4>${escapeHtml(agent.hostname)}</h4><p>${escapeHtml(agent.fingerprint)}<br>${escapeHtml(agent.platform || '')}</p></div><div class="row-actions"><button class="button danger compact reject-agent" data-id="${agent.id}" data-name="${escapeHtml(agent.hostname)}">${escapeHtml(t('admin.reject'))}</button><button class="button primary compact approve-agent" data-id="${agent.id}" data-name="${escapeHtml(agent.hostname)}">${escapeHtml(t('admin.approve'))}</button></div></div>`).join('') : `<p>${escapeHtml(t('admin.noPending'))}</p>`;
  const hostNames = new Map(state.hosts.map(host => [host.id, host.displayName]));
  $('user-list').innerHTML = users.map(user => {
    const scope = user.role === 'super_admin'
      ? t('user.allHosts')
      : t('user.hostCount', { count: user.hostIds?.length || 0, names: (user.hostIds || []).map(id => hostNames.get(id)).filter(Boolean).join(', ') || t('user.noHosts') });
    return `<div class="stack-item"><div><h4>${escapeHtml(user.username)}</h4><p>${escapeHtml(roleLabel(user.role))} / ${escapeHtml(scope)}${user.mustChangePassword ? ` / ${escapeHtml(t('user.passwordRequired'))}` : ''}</p></div><div class="row-actions"><button class="button compact edit-user" data-user="${escapeHtml(user.username)}">${escapeHtml(t('common.edit'))}</button>${user.username !== state.user.username ? `<button class="button danger compact delete-user" data-user="${escapeHtml(user.username)}">${escapeHtml(t('common.delete'))}</button>` : ''}</div></div>`;
  }).join('');
  $('discord-webhook').value = settings.discordWebhook || '';
  document.querySelectorAll('.approve-agent').forEach(button => button.addEventListener('click', () => approveAgent(button.dataset.id, button.dataset.name)));
  document.querySelectorAll('.reject-agent').forEach(button => button.addEventListener('click', () => rejectAgent(button.dataset.id, button.dataset.name)));
  document.querySelectorAll('.edit-agent').forEach(button => button.addEventListener('click', () => {
    const agent = agents.find(item => item.id === button.dataset.id);
    if (agent) openAgentDialog(agent);
  }));
  document.querySelectorAll('.revoke-agent').forEach(button => button.addEventListener('click', () => revokeAgent(button.dataset.id, button.dataset.name)));
  document.querySelectorAll('.edit-user').forEach(button => button.addEventListener('click', () => {
    const user = users.find(item => item.username === button.dataset.user);
    if (user) openUserDialog(user);
  }));
  document.querySelectorAll('.delete-user').forEach(button => button.addEventListener('click', () => deleteUser(button.dataset.user)));
}

function openAgentDialog(agent) {
  $('agent-editing').value = agent.id;
  $('agent-display-name').value = agent.displayName || agent.hostname || '';
  $('agent-notes').value = agent.notes || '';
  $('agent-identity').innerHTML = `<div><dt>${escapeHtml(t('agent.hostname'))}</dt><dd>${escapeHtml(agent.hostname || '--')}</dd></div><div><dt>${escapeHtml(t('agent.platform'))}</dt><dd>${escapeHtml(agent.platform || '--')}</dd></div><div><dt>${escapeHtml(t('agent.fingerprint'))}</dt><dd>${escapeHtml(agent.fingerprint || '--')}</dd></div>`;
  $('agent-dialog').showModal();
}

async function saveAgent(event) {
  event.preventDefault();
  try {
    const agentId = $('agent-editing').value;
    await api(`/api/v1/agents/${agentId}`, { method: 'PUT', body: JSON.stringify({ displayName: $('agent-display-name').value.trim(), notes: $('agent-notes').value.trim() }) });
    $('agent-dialog').close();
    toast(t('admin.agentUpdated'), 'success');
    await Promise.all([loadAdmin(), loadHosts()]);
  } catch (error) { toast(translateError(error), 'error'); }
}

function renderUserHostList(selectedIds = [], role = $('user-role').value) {
  const list = $('user-host-list');
  if (role !== 'super_admin') list.dataset.selectedIds = JSON.stringify(selectedIds);
  list.innerHTML = state.hosts.length
    ? state.hosts.map(host => `<label class="host-access-option"><input type="checkbox" value="${escapeHtml(host.id)}" ${selectedIds.includes(host.id) || role === 'super_admin' ? 'checked' : ''}><span title="${escapeHtml(host.hostname)}">${escapeHtml(host.displayName)}</span></label>`).join('')
    : `<p>${escapeHtml(t('user.noHosts'))}</p>`;
  const disabled = role === 'super_admin';
  list.classList.toggle('is-disabled', disabled);
  list.querySelectorAll('input').forEach(input => { input.disabled = disabled; });
  $('user-host-help').textContent = t(disabled ? 'user.superAdminHosts' : 'user.hostAccessHelp');
}

function openUserDialog(user = null) {
  const editing = Boolean(user);
  $('user-editing').value = user?.username || '';
  $('user-dialog-title').textContent = t(editing ? 'user.editTitle' : 'user.addTitle');
  $('user-save').textContent = t(editing ? 'user.save' : 'user.create');
  $('user-username').value = user?.username || '';
  $('user-username').readOnly = editing;
  $('user-password').value = '';
  $('user-password').required = !editing;
  $('user-password').placeholder = t(editing ? 'user.passwordOptional' : 'user.password');
  $('user-role').value = user?.role || 'viewer';
  renderUserHostList(user?.hostIds || [], $('user-role').value);
  $('user-dialog').showModal();
}

async function approveAgent(agentId, hostname) {
  const displayName = prompt(t('admin.displayNamePrompt'), hostname);
  if (!displayName) return;
  await api(`/api/v1/agents/${agentId}/approve`, { method: 'POST', body: JSON.stringify({ displayName }) });
  toast(t('admin.approved'), 'success');
  await Promise.all([loadAdmin(), loadHosts()]);
}

async function rejectAgent(agentId, hostname) {
  if (!confirm(t('admin.rejectConfirm', { host: hostname }))) return;
  await api(`/api/v1/agents/${agentId}/revoke`, { method: 'POST', body: '{}' });
  toast(t('admin.rejected'));
  loadAdmin();
}

async function revokeAgent(agentId, name) {
  if (!confirm(t('admin.revokeConfirm', { host: name || agentId }))) return;
  await api(`/api/v1/agents/${agentId}/revoke`, { method: 'POST', body: '{}' });
  toast(t('admin.agentRevoked'));
  await Promise.all([loadAdmin(), loadHosts()]);
}

async function saveUser(event) {
  event.preventDefault();
  try {
    const editing = $('user-editing').value;
    const hostIds = [...document.querySelectorAll('#user-host-list input:checked')].map(input => input.value);
    const body = { role: $('user-role').value, hostIds };
    if (!editing) {
      body.username = $('user-username').value.trim();
      body.password = $('user-password').value;
    } else if ($('user-password').value) {
      body.password = $('user-password').value;
    }
    await api(editing ? `/api/v1/users/${encodeURIComponent(editing)}` : '/api/v1/users', {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    $('user-dialog').close();
    $('user-form').reset();
    toast(t(editing ? 'user.updated' : 'user.created'), 'success');
    loadAdmin();
  } catch (error) { toast(translateError(error), 'error'); }
}

async function deleteUser(username) {
  if (!confirm(t('admin.deleteUserConfirm', { user: username }))) return;
  await api(`/api/v1/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
  loadAdmin();
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    await api('/api/v1/settings', { method: 'PUT', body: JSON.stringify({ discordWebhook: $('discord-webhook').value.trim() }) });
    toast(t('admin.settingsSaved'), 'success');
  } catch (error) { toast(translateError(error), 'error'); }
}

async function changePassword(event) {
  event.preventDefault();
  try {
    await api(`/api/v1/users/${encodeURIComponent(state.user.username)}/password`, { method: 'POST', body: JSON.stringify({ password: $('new-password').value }) });
    state.user.mustChangePassword = false;
    localStorage.setItem('wc_user', JSON.stringify(state.user));
    $('password-dialog').close();
    toast(t('password.updated'), 'success');
  } catch (error) { toast(translateError(error), 'error'); }
}

function navigate() {
  let page = (location.hash || '#fleet').slice(1);
  if (!pageMeta[page] || (page === 'admin' && !isSuperAdmin())) page = 'fleet';
  document.querySelectorAll('.page').forEach(section => section.hidden = section.id !== `page-${page}`);
  document.querySelectorAll('#main-nav a').forEach(link => {
    const active = link.dataset.page === page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('page-kicker').textContent = t(pageMeta[page][0]);
  $('page-title').textContent = t(pageMeta[page][1]);
  refreshPage(page);
}

function currentPage() { return (location.hash || '#fleet').slice(1); }
function refreshCurrentPage() { refreshPage(currentPage()); }
function refreshPage(page) {
  if (page === 'fleet') loadHosts().catch(showError);
  else if (page === 'dashboard') { renderDashboard(); loadTelemetryHistory().catch(showError); }
  else if (page === 'processes') loadProcesses().catch(showError);
  else if (page === 'watchdog') loadWatchdog().catch(showError);
  else if (page === 'activity') loadActivity().catch(showError);
  else if (page === 'admin') loadAdmin().catch(showError);
}
function showError(error) { toast(translateError(error), 'error'); }

$('setup-form').addEventListener('submit', setupSubmit);
$('login-form').addEventListener('submit', loginSubmit);
$('logout-button').addEventListener('click', logout);
$('host-select').addEventListener('change', event => selectHost(event.target.value));
$('refresh-button').addEventListener('click', refreshCurrentPage);
$('process-refresh').addEventListener('click', () => loadProcesses().catch(showError));
$('process-search').addEventListener('input', renderProcesses);
$('add-rule-button').addEventListener('click', () => openRuleDialog());
$('rule-form').addEventListener('submit', saveRule);
$('open-admin-button').addEventListener('click', () => location.hash = '#admin');
$('add-user-button').addEventListener('click', () => openUserDialog());
$('agent-form').addEventListener('submit', saveAgent);
$('user-role').addEventListener('change', () => {
  const list = $('user-host-list');
  const selectedIds = list.classList.contains('is-disabled')
    ? JSON.parse(list.dataset.selectedIds || '[]')
    : [...list.querySelectorAll('input:checked')].map(input => input.value);
  renderUserHostList(selectedIds, $('user-role').value);
});
$('user-form').addEventListener('submit', saveUser);
$('settings-form').addEventListener('submit', saveSettings);
$('password-form').addEventListener('submit', changePassword);
$('password-dialog').addEventListener('cancel', event => {
  if (state.user?.mustChangePassword) event.preventDefault();
});
$('language-select').addEventListener('change', event => loadTranslations(event.target.value));
$('theme-toggle').addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));
window.addEventListener('hashchange', navigate);
bootstrap().catch(showError);
