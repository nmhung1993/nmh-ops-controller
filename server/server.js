const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const {
  DATA_DIR,
  DB_FILE,
  createDatabase,
  getSetting,
  setSetting,
  migrateLegacyData,
  initializeHostAccess,
  attachLegacyDataToLocalAgent,
  parseJson
} = require('./database');
const { networkRouter } = require('./network-monitor');
const { alertEngine } = require('./alert-engine');
const { dockerManager } = require('./docker-manager');

const PORT = Number(process.env.PORT || 3003);
const HOST = process.env.HOST || '0.0.0.0';
const TELEMETRY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year retention
const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SCREENSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const AGENT_OFFLINE_MS = 20_000;
const COMMAND_TIMEOUT_MS = 60_000;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const ALLOWED_COMMANDS = new Set([
  'process.kill', 'watchdog.launch', 'window.capture', 'system.execute', 'agent.upgrade',
  'docker.info', 'docker.containers', 'docker.container.details', 'docker.container.stats',
  'docker.container.action', 'docker.container.logs', 'docker.images', 'docker.volumes', 'docker.prune'
]);
const COMMAND_CAPABILITIES = {
  'process.kill': ['process.kill', 'processes'],
  'watchdog.launch': ['watchdog.launch', 'watchdog'],
  'window.capture': ['window.capture', 'desktop-helper'],
  'system.execute': ['system.execute', 'powershell', 'windows', 'processes', 'telemetry'],
  'agent.upgrade': ['agent.upgrade', 'windows', 'telemetry', 'processes'],
  'docker.info': ['docker'],
  'docker.containers': ['docker'],
  'docker.container.details': ['docker'],
  'docker.container.stats': ['docker'],
  'docker.container.action': ['docker'],
  'docker.container.logs': ['docker'],
  'docker.images': ['docker'],
  'docker.volumes': ['docker'],
  'docker.prune': ['docker']
};

fs.mkdirSync(DATA_DIR, { recursive: true });
const SCREENSHOT_DIR = path.join(DATA_DIR, 'screenshots');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SYSTEM_SETTINGS_FILE = path.join(DATA_DIR, 'system-settings.json');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const DEFAULT_SYSTEM_SETTINGS = {
  appName: 'NMH Ops',
  appSubtitle: 'Controller',
  tagline: 'Unified Fleet & LAN Controller',
  logoText: 'NMH',
  logoUrl: '',
  ownerSignature: '@nmhung1993',
  timezone: 'Asia/Ho_Chi_Minh',
  environmentLabel: 'LAN tin cậy'
};

function loadJsonFile(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`Failed to load ${filePath}:`, err.message);
  }
  return defaultValue;
}

function saveJsonFile(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save ${filePath}:`, err.message);
  }
}

let systemSettings = { ...DEFAULT_SYSTEM_SETTINGS, ...loadJsonFile(SYSTEM_SETTINGS_FILE, {}) };

const db = createDatabase();
migrateLegacyData(db);
initializeHostAccess(db);

const JWT_SECRET = loadOrCreateSecret('jwt-secret');
const app = express();
const server = http.createServer(app);
const agentWss = new WebSocket.Server({ noServer: true });
const uiWss = new WebSocket.Server({ noServer: true });
const dockerWss = new WebSocket.Server({ noServer: true });
const agentSockets = new Map();
const pendingSockets = new Map();
const uiClients = new Set();
const lastTelemetryPersistedAt = new Map();
const loginAttempts = new Map();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.json({ limit: '12mb' }));
const staticPath = fs.existsSync(path.join(__dirname, '..', 'frontend', 'dist'))
  ? path.join(__dirname, '..', 'frontend', 'dist')
  : path.join(__dirname, '..', 'public');
app.use(express.static(staticPath));

function loadOrCreateSecret(name) {
  const file = path.join(DATA_DIR, name);
  try {
    const current = fs.readFileSync(file, 'utf8').trim();
    if (current) return current;
  } catch {}
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

function id(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function envelope(type, payload = {}, extra = {}) {
  return {
    type,
    messageId: id('msg-'),
    sentAt: new Date().toISOString(),
    payload,
    ...extra
  };
}

function sendJson(ws, value) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
}

function authenticate(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : '';
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT username, role, must_change_password FROM users WHERE username = ?').get(claims.username);
    if (!user) throw new Error('user_not_found');
    req.user = {
      username: user.username,
      role: user.role,
      mustChangePassword: Boolean(user.must_change_password)
    };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'Super admin only' });
  next();
}

function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}

function hasHostAccess(user, agentId) {
  if (isSuperAdmin(user)) return true;
  return Boolean(db.prepare(`
    SELECT 1 FROM user_host_access WHERE username = ? AND agent_id = ?
  `).get(user.username, agentId));
}

function canManageHost(user, agentId) {
  return isSuperAdmin(user) || (user?.role === 'admin' && hasHostAccess(user, agentId));
}

function requireHostAccess(req, res, next) {
  const host = getHost(req.params.id);
  if (!host || host.status !== 'approved' || !hasHostAccess(req.user, req.params.id)) {
    return res.status(404).json({ error: 'Host not found' });
  }
  req.managedHost = host;
  next();
}

function requireHostManager(req, res, next) {
  if (!canManageHost(req.user, req.params.id)) return res.status(403).json({ error: 'Host management permission required' });
  next();
}

function getAccessibleHosts(user) {
  const query = isSuperAdmin(user)
    ? `SELECT a.*, l.telemetry_json, l.telemetry_at FROM agents a LEFT JOIN latest_state l ON l.agent_id = a.id WHERE a.status = 'approved' ORDER BY a.display_name COLLATE NOCASE`
    : `SELECT a.*, l.telemetry_json, l.telemetry_at
       FROM agents a JOIN user_host_access access ON access.agent_id = a.id AND access.username = ?
       LEFT JOIN latest_state l ON l.agent_id = a.id
       WHERE a.status = 'approved' ORDER BY a.display_name COLLATE NOCASE`;
  return isSuperAdmin(user) ? db.prepare(query).all() : db.prepare(query).all(user.username);
}

function validateHostIds(hostIds) {
  const ids = [...new Set(Array.isArray(hostIds) ? hostIds.filter(value => typeof value === 'string' && value.trim()) : [])];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const valid = db.prepare(`SELECT id FROM agents WHERE status = 'approved' AND id IN (${placeholders})`).all(...ids).map(row => row.id);
  if (valid.length !== ids.length) throw new Error('One or more hosts are not approved');
  return valid;
}

function replaceUserHostAccess(username, hostIds) {
  const ids = validateHostIds(hostIds);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM user_host_access WHERE username = ?').run(username);
    const insert = db.prepare('INSERT INTO user_host_access(username, agent_id, created_at) VALUES (?, ?, ?)');
    const now = new Date().toISOString();
    for (const agentId of ids) insert.run(username, agentId, now);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return ids;
}

function getUserHostIds(username) {
  return db.prepare('SELECT agent_id FROM user_host_access WHERE username = ? ORDER BY agent_id').all(username).map(row => row.agent_id);
}

function notifyUserAccessChanged(username, role) {
  for (const client of uiClients) {
    if (client.user?.username === username) {
      client.user = { username, role };
      sendJson(client, envelope('ui.access.changed', { role }));
    }
  }
}

function loginRateLimited(ip) {
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter(ts => now - ts < 10 * 60 * 1000);
  loginAttempts.set(ip, attempts);
  return attempts.length >= 10;
}

function recordLoginFailure(ip) {
  const attempts = loginAttempts.get(ip) || [];
  attempts.push(Date.now());
  loginAttempts.set(ip, attempts);
}

function serializeHost(row) {
  const telemetry = parseJson(row.telemetry_json, null);
  const online = row.status === 'approved' && row.last_seen && Date.now() - Date.parse(row.last_seen) <= AGENT_OFFLINE_MS;
  return {
    id: row.id,
    hostname: row.hostname,
    displayName: row.display_name,
    fingerprint: row.fingerprint,
    platform: row.platform,
    version: row.version,
    notes: row.notes || '',
    status: row.status,
    online,
    lastSeen: row.last_seen,
    telemetry,
    telemetryAt: row.telemetry_at,
    capabilities: parseJson(row.capabilities_json, []),
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    revokedAt: row.revoked_at
  };
}

function getHost(agentId) {
  return db.prepare(`
    SELECT a.*, l.telemetry_json, l.telemetry_at
    FROM agents a LEFT JOIN latest_state l ON l.agent_id = a.id
    WHERE a.id = ?
  `).get(agentId);
}

function hostSupports(row, ...capabilities) {
  const available = new Set(parseJson(row?.capabilities_json, []));
  return capabilities.some(capability => available.has(capability));
}

function getWatchdog(agentId) {
  const row = db.prepare('SELECT version, config_json, updated_at FROM watchdog_configs WHERE agent_id = ?').get(agentId);
  return row
    ? { version: row.version, ...parseJson(row.config_json, { rules: [] }), updatedAt: row.updated_at }
    : { version: 0, rules: [], updatedAt: null };
}

function pushWatchdogConfig(agentId) {
  const ws = agentSockets.get(agentId);
  if (!ws) return;
  sendJson(ws, envelope('server.config', getWatchdog(agentId), { agentId }));
}

function broadcastUi(type, payload, agentId = null, options = {}) {
  const message = envelope(type, payload, agentId ? { agentId } : {});
  for (const client of uiClients) {
    const user = db.prepare('SELECT username, role FROM users WHERE username = ?').get(client.user?.username);
    if (!user || (options.superOnly && user.role !== 'super_admin')) continue;
    if (agentId && !hasHostAccess(user, agentId)) continue;
    if (!agentId || !client.subscribedAgentId || client.subscribedAgentId === agentId) sendJson(client, message);
  }
}

function updateAgentLastSeen(agentId) {
  const now = new Date().toISOString();
  db.prepare('UPDATE agents SET last_seen = ? WHERE id = ?').run(now, agentId);
  const ws = agentSockets.get(agentId);
  if (ws) ws.lastSeenMs = Date.now();
}

async function sendDiscord(content, image = null) {
  const webhook = getSetting(db, 'discord_webhook', '');
  if (!webhook) return;
  try {
    let response;
    if (image) {
      const form = new FormData();
      form.append('content', content);
      form.append('file', new Blob([image.buffer], { type: 'image/png' }), image.name);
      response = await fetch(webhook, { method: 'POST', body: form });
    } else {
      response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
    }
    if (!response.ok) console.error('Discord webhook failed:', response.status);
  } catch (error) {
    console.error('Discord webhook failed:', error.message);
  }
}

function discordErrorText(error) {
  const messages = {
    interactive_session_unavailable: 'không có Desktop Helper trong phiên người dùng đang đăng nhập',
    window_not_found: 'không tìm thấy cửa sổ của tiến trình',
    screenshot_failed: 'không thể chụp nội dung cửa sổ',
    desktop_helper_timeout: 'Desktop Helper không phản hồi trong thời gian cho phép',
    desktop_helper_secret_mismatch: 'Desktop Helper đang chạy với cấu hình cũ; hãy cài lại Agent hoặc đăng xuất rồi đăng nhập Windows',
    window_activation_failed: 'không thể đưa cửa sổ ứng dụng lên phía trước'
  };
  return messages[error] || error || 'lỗi không xác định';
}

function formatDiscordEvent(hostName, payload) {
  const processName = payload.processName ? `\`${payload.processName}\`` : 'ứng dụng';
  const error = discordErrorText(payload.message);
  switch (payload.eventType) {
    case 'process.manual.launch':
      return payload.captureScheduled ? null : `🚀 [${hostName}] Đã khởi chạy thủ công ${processName}.`;
    case 'process.manual.already_running':
      return payload.captureScheduled ? null : `ℹ️ [${hostName}] ${processName} đã chạy từ trước.`;
    case 'process.manual.launch_failed':
      return `❌ [${hostName}] Không thể khởi chạy thủ công ${processName}: ${error}.`;
    case 'process.manual.screenshot_failed':
      return `❌ [${hostName}] Không thể chụp cửa sổ ${processName} sau khi khởi chạy thủ công: ${error}.`;
    case 'watchdog.process.down':
      return `⚠️ [${hostName}] Watchdog phát hiện ${processName} đã ngừng chạy.`;
    case 'watchdog.process.relaunched':
      return `✅ [${hostName}] Watchdog đã khởi động lại ${processName}.`;
    case 'watchdog.process.relaunch_failed':
      return `❌ [${hostName}] Watchdog không thể khởi động lại ${processName}: ${error}.`;
    case 'watchdog.screenshot.failed':
      return `⚠️ [${hostName}] Không thể chụp cửa sổ ${processName}: ${error}.`;
    default:
      return payload.severity === 'error' ? `❌ [${hostName}] ${error}.` : null;
  }
}

function insertEvent(agentId, message) {
  const payload = message.payload || {};
  const severity = payload.severity || 'info';
  const occurredAt = payload.occurredAt || message.sentAt || new Date().toISOString();
  const result = db.prepare(`
    INSERT OR IGNORE INTO events(message_id, agent_id, type, severity, payload_json, occurred_at, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(message.messageId, agentId, payload.eventType || message.type, severity,
    JSON.stringify(payload), occurredAt, new Date().toISOString());
  if (result.changes) {
    broadcastUi('ui.event', { ...payload, severity, occurredAt }, agentId);
    if (payload.eventType?.startsWith('process.manual.')) {
      const host = getHost(agentId);
      const content = formatDiscordEvent(host?.display_name || host?.hostname || agentId, { ...payload, severity });
      if (content) sendDiscord(content);
    } else if (payload.eventType?.startsWith('watchdog.') || payload.eventType?.includes('watchdog')) {
      const host = getHost(agentId);

      // Dedicated Watchdog Self-Healing & Process Alerting (strictly for this host)
      const watchdogConfig = getWatchdog(agentId);
      alertEngine.sendWatchdogAlert({
        eventType: payload.eventType || 'watchdog.event',
        message: payload.message,
        data: payload
      }, host, watchdogConfig);
    }
  }
}

function upsertLatestTelemetry(agentId, telemetry, sentAt) {
  const current = db.prepare('SELECT telemetry_at FROM latest_state WHERE agent_id = ?').get(agentId);
  if (current?.telemetry_at && Date.parse(current.telemetry_at) > Date.parse(sentAt)) return;
  db.prepare(`
    INSERT INTO latest_state(agent_id, telemetry_json, telemetry_at) VALUES (?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET telemetry_json = excluded.telemetry_json, telemetry_at = excluded.telemetry_at
  `).run(agentId, JSON.stringify(telemetry), sentAt);
}

function storeTelemetry(agentId, message) {
  const telemetry = message.payload || {};
  const timestamp = telemetry.timestamp || message.sentAt || new Date().toISOString();
  upsertLatestTelemetry(agentId, telemetry, timestamp);
  const timestampMs = Date.parse(timestamp);
  const lastMs = lastTelemetryPersistedAt.get(agentId) || 0;
  if (timestampMs - lastMs >= 10_000) {
    const result = db.prepare(`
      INSERT OR IGNORE INTO telemetry(agent_id, message_id, ts, cpu_usage, memory_percent, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(agentId, message.messageId, timestamp, Number(telemetry.cpu?.usage || 0),
      Number(telemetry.memory?.percent || 0), JSON.stringify(telemetry));
    if (result.changes) lastTelemetryPersistedAt.set(agentId, timestampMs);
  }

  // Smart Threshold Evaluation
  const host = getHost(agentId);
  if (host) {
    alertEngine.evaluateTelemetry({
      id: host.id,
      hostname: host.hostname,
      displayName: host.display_name
    }, telemetry);
  }

  broadcastUi('ui.telemetry', telemetry, agentId);
}

function storeProcesses(agentId, message) {
  const processes = Array.isArray(message.payload?.processes) ? message.payload.processes : [];
  db.prepare(`
    INSERT INTO latest_state(agent_id, processes_json, processes_at) VALUES (?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET processes_json = excluded.processes_json, processes_at = excluded.processes_at
  `).run(agentId, JSON.stringify(processes), message.sentAt || new Date().toISOString());
  broadcastUi('ui.processes', { processes }, agentId);
}

function storeScreenshot(agentId, message) {
  const payload = message.payload || {};
  const buffer = Buffer.from(payload.data || '', 'base64');
  if (!buffer.length || buffer.length > MAX_SCREENSHOT_BYTES) throw new Error('Invalid screenshot size');
  const screenshotId = id('shot-');
  const filePath = path.join(SCREENSHOT_DIR, `${screenshotId}.png`);
  fs.writeFileSync(filePath, buffer);
  db.prepare(`
    INSERT INTO screenshots(id, agent_id, command_id, process_name, file_path, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(screenshotId, agentId, payload.commandId || null, payload.processName || null,
    filePath, buffer.length, new Date().toISOString());
  const host = getHost(agentId);
  const hostName = host?.display_name || host?.hostname || agentId;
  const processName = payload.processName ? `\`${payload.processName}\`` : 'ứng dụng';
  const content = payload.source === 'manual.launch'
    ? `📸 [${hostName}] Ảnh chụp cửa sổ ${processName} sau khi khởi chạy thủ công.`
    : `📸 [${hostName}] Ảnh chụp cửa sổ ${processName}.`;
  sendDiscord(content,
    { buffer, name: `${payload.processName || 'screenshot'}.png` });
  broadcastUi('ui.screenshot', { id: screenshotId, processName: payload.processName }, agentId);
}

const pendingCommandPromises = new Map();

function updateCommandResult(agentId, message) {
  const payload = message.payload || {};
  const command = db.prepare('SELECT * FROM commands WHERE id = ? AND agent_id = ?').get(payload.commandId, agentId);
  if (!command) return;
  const status = ['acknowledged', 'succeeded', 'failed'].includes(payload.status) ? payload.status : 'failed';
  const now = new Date().toISOString();
  if (status === 'acknowledged') {
    db.prepare('UPDATE commands SET status = ?, acknowledged_at = ? WHERE id = ?').run(status, now, command.id);
  } else {
    db.prepare('UPDATE commands SET status = ?, completed_at = ?, result_json = ? WHERE id = ?')
      .run(status, now, JSON.stringify(payload.result || { error: payload.error }), command.id);

    // Resolve or reject waiting async API caller
    const pending = pendingCommandPromises.get(command.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingCommandPromises.delete(command.id);
      if (status === 'succeeded') pending.resolve(payload.result);
      else pending.reject(new Error(payload.error || 'Agent command failed'));
    }
  }
  broadcastUi('ui.command', { commandId: command.id, status, result: payload.result, error: payload.error }, agentId);
}

function sendCommandToAgent(command) {
  const ws = agentSockets.get(command.agent_id);
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  db.prepare('UPDATE commands SET status = ?, sent_at = ? WHERE id = ?')
    .run('sent', new Date().toISOString(), command.id);
  sendJson(ws, envelope('server.command', {
    commandId: command.id,
    commandType: command.type,
    data: parseJson(command.payload_json, {}),
    expiresAt: command.expires_at
  }, { agentId: command.agent_id }));
  return true;
}

function dispatchPendingCommands(agentId) {
  const commands = db.prepare(`
    SELECT * FROM commands
    WHERE agent_id = ? AND status IN ('queued', 'sent') AND expires_at > ?
    ORDER BY requested_at ASC
  `).all(agentId, new Date().toISOString());
  for (const command of commands) sendCommandToAgent(command);
}

function createCommand(agentId, type, payload, username, timeoutMs = COMMAND_TIMEOUT_MS) {
  const command = {
    id: id('cmd-'),
    agent_id: agentId,
    type,
    payload_json: JSON.stringify(payload || {}),
    status: 'queued',
    requested_by: username,
    requested_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + timeoutMs).toISOString()
  };
  db.prepare(`
    INSERT INTO commands(id, agent_id, type, payload_json, status, requested_by, requested_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(command.id, command.agent_id, command.type, command.payload_json, command.status,
    command.requested_by, command.requested_at, command.expires_at);
  sendCommandToAgent(command);
  return command;
}

function executeAgentCommand(agentId, type, payload = {}, timeoutMs = 12000, username = 'api') {
  return new Promise((resolve, reject) => {
    const ws = agentSockets.get(agentId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return reject(new Error('Agent is not connected or offline'));
    }
    const command = createCommand(agentId, type, payload, username, timeoutMs);
    const timer = setTimeout(() => {
      pendingCommandPromises.delete(command.id);
      reject(new Error(`Agent command '${type}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingCommandPromises.set(command.id, { resolve, reject, timer });
  });
}

function validateCommand(type, payload) {
  if (!ALLOWED_COMMANDS.has(type)) return 'Unsupported command type';
  if (type === 'process.kill' && (!Number.isInteger(Number(payload.pid)) || Number(payload.pid) <= 0)) return 'Valid PID required';
  if (type === 'watchdog.launch' && !payload.ruleId) return 'ruleId required';
  if (type === 'window.capture' && !payload.processName) return 'processName required';
  if (type === 'system.execute' && !payload.command?.trim()) return 'command required';
  if (type.startsWith('docker.')) return null;
  if (type === 'agent.upgrade') return null;
  return null;
}

agentWss.on('connection', ws => {
  ws.isAlive = true;
  ws.isApproved = false;
  const helloTimer = setTimeout(() => ws.close(4001, 'hello timeout'), 10_000);

  ws.on('message', raw => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return ws.close(4002, 'invalid json');
    }

    if (message.type === 'agent.hello') {
      clearTimeout(helloTimer);
      const payload = message.payload || {};
      if (!payload.installId || !payload.token || !payload.hostname || !payload.fingerprint) {
        return ws.close(4003, 'invalid hello');
      }
      const tokenHash = hashToken(payload.token);
      let agent = db.prepare('SELECT * FROM agents WHERE install_id = ?').get(payload.installId);
      const now = new Date().toISOString();
      if (!agent) {
        const agentId = id('agent-');
        db.prepare(`
          INSERT INTO agents(id, install_id, hostname, display_name, fingerprint, platform, version, status,
            token_hash, capabilities_json, created_at, last_seen)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
        `).run(agentId, payload.installId, payload.hostname, payload.hostname, payload.fingerprint,
          payload.platform || 'Windows', payload.version || 'unknown', tokenHash,
          JSON.stringify(payload.capabilities || []), now, now);
        agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
        attachLegacyDataToLocalAgent(db, agentId, payload.hostname);
      broadcastUi('ui.agent.pending', serializeHost(getHost(agentId)), null, { superOnly: true });
      } else {
        if (agent.token_hash !== tokenHash) return ws.close(4004, 'invalid agent token');
        if (agent.status === 'revoked') return ws.close(4005, 'agent revoked');
        db.prepare(`
          UPDATE agents SET hostname = ?, fingerprint = ?, platform = ?, version = ?, capabilities_json = ?, last_seen = ?
          WHERE id = ?
        `).run(payload.hostname, payload.fingerprint, payload.platform || agent.platform,
          payload.version || agent.version, JSON.stringify(payload.capabilities || []), now, agent.id);
        agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);
      }

      ws.agentId = agent.id;
      ws.installId = agent.install_id;
      ws.lastSeenMs = Date.now();
      if (agent.status === 'approved') {
        ws.isApproved = true;
        agentSockets.set(agent.id, ws);
        pendingSockets.delete(agent.id);
        sendJson(ws, envelope('server.approved', { agentId: agent.id }, { agentId: agent.id }));
        pushWatchdogConfig(agent.id);
        dispatchPendingCommands(agent.id);
      } else {
        pendingSockets.set(agent.id, ws);
        sendJson(ws, envelope('server.pending', { agentId: agent.id }, { agentId: agent.id }));
      }
      broadcastUi('ui.host.status', serializeHost(getHost(agent.id)));
      return;
    }

    if (!ws.agentId) return ws.close(4006, 'hello required');
    updateAgentLastSeen(ws.agentId);
    if (message.type === 'ping') return sendJson(ws, envelope('pong', {}, { agentId: ws.agentId }));
    if (!ws.isApproved) return;

    try {
      if (message.type === 'agent.telemetry') storeTelemetry(ws.agentId, message);
      else if (message.type === 'agent.processes') storeProcesses(ws.agentId, message);
      else if (message.type === 'agent.event') insertEvent(ws.agentId, message);
      else if (message.type === 'agent.command.result') updateCommandResult(ws.agentId, message);
      else if (message.type === 'agent.screenshot') storeScreenshot(ws.agentId, message);
      else if (message.type === 'agent.config.ack') {
        broadcastUi('ui.config.ack', message.payload || {}, ws.agentId);
      }
    } catch (error) {
      console.error(`Agent message error (${ws.agentId}):`, error.message);
      sendJson(ws, envelope('server.error', { error: error.message }, { agentId: ws.agentId }));
    }
  });

  ws.on('close', () => {
    clearTimeout(helloTimer);
    if (!ws.agentId) return;
    if (agentSockets.get(ws.agentId) === ws) agentSockets.delete(ws.agentId);
    if (pendingSockets.get(ws.agentId) === ws) pendingSockets.delete(ws.agentId);
    broadcastUi('ui.host.status', serializeHost(getHost(ws.agentId)));
  });
});

uiWss.on('connection', (ws, req, user) => {
  ws.user = user;
  ws.subscribedAgentId = null;
  uiClients.add(ws);
  ws.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'ui.subscribe') {
        const agentId = message.payload?.agentId || null;
        ws.subscribedAgentId = agentId && hasHostAccess(ws.user, agentId) ? agentId : null;
      }
      if (message.type === 'ping') sendJson(ws, envelope('pong'));
    } catch {}
  });
  ws.on('close', () => uiClients.delete(ws));
});

server.on('upgrade', (req, socket, head) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/ws/agent') {
    return agentWss.handleUpgrade(req, socket, head, ws => agentWss.emit('connection', ws, req));
  }
  if (requestUrl.pathname === '/ws/ui') {
    try {
      const claims = jwt.verify(requestUrl.searchParams.get('token') || '', JWT_SECRET);
      const user = db.prepare('SELECT username, role FROM users WHERE username = ?').get(claims.username);
      if (!user) throw new Error('user_not_found');
      return uiWss.handleUpgrade(req, socket, head, ws => uiWss.emit('connection', ws, req, user));
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
  }
  if (requestUrl.pathname === '/ws/docker/logs') {
    try {
      const claims = jwt.verify(requestUrl.searchParams.get('token') || '', JWT_SECRET);
      const user = db.prepare('SELECT username, role FROM users WHERE username = ?').get(claims.username);
      if (!user) throw new Error('user_not_found');
      const containerId = requestUrl.searchParams.get('containerId');
      const tail = Number(requestUrl.searchParams.get('tail')) || 100;
      if (!containerId) throw new Error('containerId required');

      return dockerWss.handleUpgrade(req, socket, head, ws => {
        dockerManager.streamLogsToWebSocket(containerId, ws, { tail });
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
  }
  if (requestUrl.pathname === '/ws/docker/exec') {
    try {
      const claims = jwt.verify(requestUrl.searchParams.get('token') || '', JWT_SECRET);
      const user = db.prepare('SELECT username, role FROM users WHERE username = ?').get(claims.username);
      if (!user) throw new Error('user_not_found');
      const execId = requestUrl.searchParams.get('execId');
      if (!execId) throw new Error('execId required');

      return dockerWss.handleUpgrade(req, socket, head, ws => {
        dockerManager.attachExecToWebSocket(execId, ws);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
  }
  socket.destroy();
});

app.get('/api/setup/status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  res.json({ required: count === 0 });
});

app.post('/api/setup', async (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count !== 0) return res.status(409).json({ error: 'Setup already completed' });
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 10) {
    return res.status(400).json({ error: 'Username and password of at least 10 characters required' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  db.prepare(`INSERT INTO users(username, password_hash, role, must_change_password, created_at) VALUES (?, ?, 'super_admin', 0, ?)`)
    .run(username.trim(), passwordHash, new Date().toISOString());
  res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (loginRateLimited(ip)) return res.status(429).json({ error: 'Too many login attempts' });
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  loginAttempts.delete(ip);
  const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: user.username, role: user.role, mustChangePassword: Boolean(user.must_change_password) });
});

// Network Monitoring (Ping, Subnet Scanner, Xiaomi Router/Mesh)
app.use('/api/v1/network', authenticate, networkRouter);

app.get('/api/v1/hosts', authenticate, (req, res) => {
  res.json(getAccessibleHosts(req.user).map(serializeHost));
});

app.get('/api/v1/hosts/:id', authenticate, requireHostAccess, (req, res) => {
  res.json(serializeHost(req.managedHost));
});

function handleTelemetryHistoryQuery(req, res) {
  const from = req.query.from || new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const to = req.query.to || new Date().toISOString();
  const limit = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 5000);

  // Fetch all points in the requested time interval
  const rows = db.prepare(`
    SELECT ts, payload_json FROM telemetry WHERE agent_id = ? AND ts BETWEEN ? AND ? ORDER BY ts ASC
  `).all(req.params.id, from, to);

  const mapped = rows.map(row => ({ timestamp: row.ts, ...parseJson(row.payload_json, {}) }));

  if (mapped.length <= limit) {
    return res.json(mapped);
  }

  // Downsample evenly across the time window
  const step = mapped.length / limit;
  const downsampled = [];
  for (let i = 0; i < limit; i++) {
    const idx = Math.min(Math.floor(i * step), mapped.length - 1);
    downsampled.push(mapped[idx]);
  }
  // Ensure the latest telemetry sample is included
  if (mapped.length > 0 && downsampled[downsampled.length - 1] !== mapped[mapped.length - 1]) {
    downsampled[downsampled.length - 1] = mapped[mapped.length - 1];
  }

  res.json(downsampled);
}

app.get('/api/v1/hosts/:id/telemetry', authenticate, requireHostAccess, handleTelemetryHistoryQuery);
app.get('/api/v1/hosts/:id/history', authenticate, requireHostAccess, handleTelemetryHistoryQuery);

app.get('/api/v1/hosts/:id/processes', authenticate, requireHostAccess, (req, res) => {
  let commandId = null;
  if (agentSockets.has(req.params.id) && hostSupports(req.managedHost, 'processes')) {
    commandId = createCommand(req.params.id, 'process.list', {}, req.user.username, 30_000).id;
  }
  const state = db.prepare('SELECT processes_json, processes_at FROM latest_state WHERE agent_id = ?').get(req.params.id);
  let processes = parseJson(state?.processes_json, []);
  if (!canManageHost(req.user, req.params.id)) processes = processes.map(process => ({ ...process, path: '' }));
  res.json({ processes, updatedAt: state?.processes_at || null, commandId });
});

app.post('/api/v1/hosts/:id/commands', authenticate, requireHostAccess, requireHostManager, (req, res) => {
  const { type, payload = {} } = req.body || {};
  const error = validateCommand(type, payload);
  if (error) return res.status(400).json({ error });
  if (!hostSupports(req.managedHost, ...(COMMAND_CAPABILITIES[type] || []))) {
    return res.status(409).json({ error: 'capability_not_supported' });
  }
  const command = createCommand(req.params.id, type, payload, req.user.username);
  res.status(202).json({ id: command.id, status: command.status });
});

app.get('/api/v1/hosts/:id/commands', authenticate, requireHostAccess, (req, res) => {
  const rows = db.prepare(`SELECT * FROM commands WHERE agent_id = ? ORDER BY requested_at DESC LIMIT 100`).all(req.params.id);
  res.json(rows.map(row => ({
    id: row.id,
    type: row.type,
    payload: canManageHost(req.user, req.params.id) ? parseJson(row.payload_json, {}) : undefined,
    status: row.status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    result: parseJson(row.result_json, null)
  })));
});

app.get('/api/v1/hosts/:id/watchdog', authenticate, requireHostAccess, (req, res) => {
  const config = getWatchdog(req.params.id);
  if (!canManageHost(req.user, req.params.id)) {
    config.rules = config.rules.map(rule => ({ ...rule, filePath: undefined }));
  }
  res.json(config);
});

app.put('/api/v1/hosts/:id/watchdog', authenticate, requireHostAccess, requireHostManager, (req, res) => {
  if (!hostSupports(req.managedHost, 'watchdog')) return res.status(409).json({ error: 'capability_not_supported' });
  const rules = req.body?.rules;
  const notifications = req.body?.notifications || {};
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules array required' });
  for (const rule of rules) {
    if (!rule.id || !rule.processName || !rule.filePath || !['service', 'interactive'].includes(rule.runMode)) {
      return res.status(400).json({ error: 'Each rule requires id, processName, filePath and valid runMode' });
    }
  }
  const current = getWatchdog(req.params.id);
  const version = current.version + 1;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO watchdog_configs(agent_id, version, config_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET version = excluded.version, config_json = excluded.config_json, updated_at = excluded.updated_at
  `).run(req.params.id, version, JSON.stringify({ rules, notifications }), now);
  pushWatchdogConfig(req.params.id);
  res.json({ version, rules, notifications, updatedAt: now });
});

app.post('/api/v1/hosts/:id/watchdog/test', authenticate, requireHostAccess, requireHostManager, async (req, res) => {
  const host = getHost(req.params.id);
  if (!host) return res.status(404).json({ error: 'Host not found' });
  const currentConfig = getWatchdog(req.params.id);
  const notifications = req.body?.notifications || currentConfig?.notifications;

  if (!notifications?.enabled) {
    return res.status(400).json({ error: 'Kênh thông báo Watchdog của máy này chưa được bật (cần tích chọn Kích hoạt thông báo).' });
  }

  const dummyEvent = {
    eventType: 'watchdog.test',
    message: `Thử nghiệm gửi thông báo sự cố Watchdog thành công từ máy trạm [${host.display_name || host.hostname}]`,
    data: { processName: 'TestProcess.exe', ruleName: 'Kiểm tra kênh Watchdog' }
  };

  const sent = await alertEngine.sendWatchdogAlert(dummyEvent, host, { ...currentConfig, notifications });
  if (!sent) {
    return res.status(400).json({ error: 'Không thể gửi thông báo. Vui lòng kiểm tra lại Bot Token/Chat ID Telegram hoặc Webhook Discord của máy này.' });
  }
  res.json({ success: true, message: `Đã gửi thông báo thử nghiệm Watchdog đến kênh riêng của máy trạm [${host.display_name || host.hostname}].` });
});

app.get('/api/v1/hosts/:id/events', authenticate, requireHostAccess, (req, res) => {
  const rows = db.prepare(`
    SELECT id, type, severity, payload_json, occurred_at FROM events
    WHERE agent_id = ? ORDER BY occurred_at DESC LIMIT 200
  `).all(req.params.id);
  res.json(rows.map(row => ({ id: row.id, type: row.type, severity: row.severity,
    payload: parseJson(row.payload_json, {}), occurredAt: row.occurred_at })));
});

app.get('/api/v1/agents/pending', authenticate, requireSuperAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, l.telemetry_json, l.telemetry_at FROM agents a
    LEFT JOIN latest_state l ON l.agent_id = a.id WHERE a.status = 'pending' ORDER BY a.created_at
  `).all();
  res.json(rows.map(serializeHost));
});

app.get('/api/v1/agents', authenticate, requireSuperAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, l.telemetry_json, l.telemetry_at FROM agents a
    LEFT JOIN latest_state l ON l.agent_id = a.id
    ORDER BY CASE a.status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      a.display_name COLLATE NOCASE, a.created_at
  `).all();
  res.json(rows.map(serializeHost));
});

app.put('/api/v1/agents/:id', authenticate, requireSuperAdmin, (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const displayName = String(req.body?.displayName || '').trim();
  const notes = String(req.body?.notes || '').trim();
  if (!displayName || displayName.length > 80) {
    return res.status(400).json({ error: 'Display name must contain 1 to 80 characters' });
  }
  if (notes.length > 500) return res.status(400).json({ error: 'Notes must not exceed 500 characters' });
  db.prepare('UPDATE agents SET display_name = ?, notes = ? WHERE id = ?').run(displayName, notes, agent.id);
  const updated = getHost(agent.id);
  broadcastUi('ui.host.status', serializeHost(updated));
  res.json(serializeHost(updated));
});

app.post('/api/v1/agents/:id/approve', authenticate, requireSuperAdmin, (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent || agent.status !== 'pending') return res.status(404).json({ error: 'Pending agent not found' });
  const now = new Date().toISOString();
  db.prepare(`UPDATE agents SET status = 'approved', display_name = ?, approved_at = ?, revoked_at = NULL WHERE id = ?`)
    .run(req.body?.displayName?.trim() || agent.hostname, now, agent.id);
  const ws = pendingSockets.get(agent.id);
  if (ws) {
    ws.isApproved = true;
    pendingSockets.delete(agent.id);
    agentSockets.set(agent.id, ws);
    sendJson(ws, envelope('server.approved', { agentId: agent.id }, { agentId: agent.id }));
    pushWatchdogConfig(agent.id);
    dispatchPendingCommands(agent.id);
  }
  broadcastUi('ui.host.status', serializeHost(getHost(agent.id)));
  res.json(serializeHost(getHost(agent.id)));
});

app.post('/api/v1/agents/:id/revoke', authenticate, requireSuperAdmin, (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  db.prepare(`UPDATE agents SET status = 'revoked', revoked_at = ? WHERE id = ?`).run(new Date().toISOString(), agent.id);
  db.prepare('DELETE FROM user_host_access WHERE agent_id = ?').run(agent.id);
  const ws = agentSockets.get(agent.id) || pendingSockets.get(agent.id);
  if (ws) ws.close(4005, 'agent revoked');
  agentSockets.delete(agent.id);
  pendingSockets.delete(agent.id);
  broadcastUi('ui.host.status', serializeHost(getHost(agent.id)));
  res.json({ success: true });
});

app.get('/api/v1/users', authenticate, requireSuperAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT username, role, must_change_password AS mustChangePassword, created_at AS createdAt
    FROM users ORDER BY username
  `).all().map(user => ({ ...user, hostIds: getUserHostIds(user.username) }));
  res.json(users);
});

app.post('/api/v1/users', authenticate, requireSuperAdmin, async (req, res) => {
  const { username, password, role, hostIds = [] } = req.body || {};
  if (!username?.trim() || !password || password.length < 10 || !['super_admin', 'admin', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Valid username, role and password of at least 10 characters required' });
  }
  let assignedHostIds;
  try {
    assignedHostIds = role === 'super_admin' ? [] : validateHostIds(hostIds);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  let created = false;
  try {
    db.prepare('INSERT INTO users(username, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
      .run(username.trim(), await bcrypt.hash(password, 12), role, new Date().toISOString());
    created = true;
    if (role !== 'super_admin') replaceUserHostAccess(username.trim(), assignedHostIds);
    res.status(201).json({ username: username.trim(), role, hostIds: assignedHostIds });
  } catch (error) {
    if (created) db.prepare('DELETE FROM users WHERE username = ?').run(username.trim());
    res.status(409).json({ error: created ? error.message : 'User already exists' });
  }
});

app.put('/api/v1/users/:username', authenticate, requireSuperAdmin, async (req, res) => {
  const current = db.prepare('SELECT username, role FROM users WHERE username = ?').get(req.params.username);
  if (!current) return res.status(404).json({ error: 'User not found' });
  const { role, hostIds = [], password } = req.body || {};
  if (!['super_admin', 'admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'Valid role required' });
  if (password && password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  if (current.role === 'super_admin' && role !== 'super_admin') {
    const count = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin'").get().count;
    if (count <= 1) return res.status(400).json({ error: 'Cannot demote the last super admin' });
  }

  let assignedHostIds;
  try {
    assignedHostIds = role === 'super_admin' ? [] : validateHostIds(hostIds);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const passwordHash = password ? await bcrypt.hash(password, 12) : null;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (passwordHash) {
      db.prepare('UPDATE users SET role = ?, password_hash = ?, must_change_password = 0 WHERE username = ?')
        .run(role, passwordHash, current.username);
    } else {
      db.prepare('UPDATE users SET role = ? WHERE username = ?').run(role, current.username);
    }
    db.prepare('DELETE FROM user_host_access WHERE username = ?').run(current.username);
    if (role !== 'super_admin') {
      const insert = db.prepare('INSERT INTO user_host_access(username, agent_id, created_at) VALUES (?, ?, ?)');
      const now = new Date().toISOString();
      for (const agentId of assignedHostIds) insert.run(current.username, agentId, now);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    return res.status(400).json({ error: error.message });
  }
  notifyUserAccessChanged(current.username, role);
  res.json({ username: current.username, role, hostIds: assignedHostIds });
});

app.delete('/api/v1/users/:username', authenticate, requireSuperAdmin, (req, res) => {
  if (req.params.username === req.user.username) return res.status(400).json({ error: 'Cannot delete current user' });
  const user = db.prepare('SELECT role FROM users WHERE username = ?').get(req.params.username);
  if (user?.role === 'super_admin') {
    const count = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin'").get().count;
    if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last super admin' });
  }
  const result = db.prepare('DELETE FROM users WHERE username = ?').run(req.params.username);
  if (!result.changes) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

app.post('/api/v1/users/:username/password', authenticate, async (req, res) => {
  if (!isSuperAdmin(req.user) && req.user.username !== req.params.username) return res.status(403).json({ error: 'Forbidden' });
  const password = req.body?.password;
  if (!password || password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  const result = db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = ?')
    .run(await bcrypt.hash(password, 12), req.params.username);
  if (!result.changes) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

app.get('/api/v1/settings', authenticate, requireSuperAdmin, (req, res) => {
  const webhook = getSetting(db, 'discord_webhook', '');
  res.json({ discordWebhookConfigured: Boolean(webhook), discordWebhook: webhook });
});

app.put('/api/v1/settings', authenticate, requireSuperAdmin, (req, res) => {
  setSetting(db, 'discord_webhook', req.body?.discordWebhook?.trim() || '');
  res.json({ success: true });
});

// GET System & Brand Settings (Public / All Authenticated)
app.get('/api/v1/system/settings', (req, res) => {
  res.json(systemSettings);
});

// PUT System & Brand Settings (Super Admin only)
app.put('/api/v1/system/settings', authenticate, requireSuperAdmin, (req, res) => {
  const { appName, appSubtitle, tagline, logoText, logoUrl, ownerSignature, timezone, environmentLabel } = req.body || {};

  if (appName !== undefined) systemSettings.appName = String(appName).trim() || 'NMH Ops';
  if (appSubtitle !== undefined) systemSettings.appSubtitle = String(appSubtitle).trim();
  if (tagline !== undefined) systemSettings.tagline = String(tagline).trim();
  if (logoText !== undefined) systemSettings.logoText = String(logoText).trim() || 'NMH';
  if (logoUrl !== undefined) systemSettings.logoUrl = String(logoUrl).trim();
  if (ownerSignature !== undefined) systemSettings.ownerSignature = String(ownerSignature).trim() || '@nmhung1993';
  if (timezone !== undefined) systemSettings.timezone = String(timezone).trim() || 'Asia/Ho_Chi_Minh';
  if (environmentLabel !== undefined) systemSettings.environmentLabel = String(environmentLabel).trim() || 'LAN tin cậy';

  saveJsonFile(SYSTEM_SETTINGS_FILE, systemSettings);
  broadcastUi('ui.system.settings', systemSettings);
  res.json({ success: true, settings: systemSettings });
});

// GET Alert Rules & Notification Channels
app.get('/api/v1/alerts/rules', authenticate, (req, res) => {
  res.json(alertEngine.config);
});

// PUT Alert Rules & Notification Channels (Super Admin only)
app.put('/api/v1/alerts/rules', authenticate, requireSuperAdmin, (req, res) => {
  const success = alertEngine.saveConfig(req.body || {});
  if (success) {
    // If discord webhook was updated, sync to db legacy setting as well
    if (req.body?.channels?.discord?.webhookUrl !== undefined) {
      setSetting(db, 'discord_webhook', req.body.channels.discord.webhookUrl);
    }
    res.json({ success: true, config: alertEngine.config });
  } else {
    res.status(500).json({ error: 'Failed to save alert rules' });
  }
});

// POST Send Test Alert Notification
app.post('/api/v1/alerts/test', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await alertEngine.dispatchAlert({
      hostName: 'Central Controller (Test)',
      title: 'Kiểm tra thông báo cảnh báo',
      message: 'Đây là thông báo thử nghiệm từ hệ thống NMH Ops.',
      severity: 'info',
      details: [
        { name: 'Kênh kiểm tra', value: 'Telegram / Discord / Webhook' },
        { name: 'Trạng thái', value: 'Hoạt động bình thường' }
      ]
    });
    res.json({ success: true, message: 'Đã gửi thông báo kiểm tra' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/screenshots/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(req.params.id);
  if (!row || !hasHostAccess(req.user, row.agent_id) || !fs.existsSync(row.file_path)) {
    return res.status(404).json({ error: 'Screenshot not found' });
  }
  res.sendFile(row.file_path);
});

// ==========================================
// OTA (Over-The-Air) Upgrade Endpoints
// ==========================================
app.get('/api/v1/ota/status', authenticate, (req, res) => {
  const version = '2.1.5';
  res.json({
    serverVersion: version,
    latestAgentVersion: version,
    releaseNotes: 'v2.1.5: Đồng bộ Fleet Agents, Docker Web Console Shell, Nâng cấp lưu trữ mạng 7-ngày và tối ưu WebSocket',
    releaseDate: '2026-08-18'
  });
});

app.get('/api/v1/ota/agent-bundle', (req, res) => {
  try {
    const agentPath = path.join(__dirname, '..', 'agent', 'agent.js');
    const windowsPath = path.join(__dirname, '..', 'agent', 'windows.js');
    const files = {};
    if (fs.existsSync(agentPath)) files['agent.js'] = fs.readFileSync(agentPath, 'utf8');
    if (fs.existsSync(windowsPath)) files['windows.js'] = fs.readFileSync(windowsPath, 'utf8');
    res.json({
      version: '2.1.5',
      files
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/hosts/:id/upgrade', authenticate, requireSuperAdmin, (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const command = createCommand(req.params.id, 'agent.upgrade', {
    targetVersion: '2.1.4',
    downloadUrl: '/api/v1/ota/agent-bundle'
  }, req.user.username, 60_000);
  res.status(202).json({ id: command.id, status: command.status });
});

app.post('/api/v1/hosts/upgrade-all', authenticate, requireSuperAdmin, (req, res) => {
  const agents = db.prepare("SELECT id FROM agents WHERE status = 'approved'").all();
  const queued = [];
  for (const a of agents) {
    if (agentSockets.has(a.id)) {
      const command = createCommand(a.id, 'agent.upgrade', {
        targetVersion: '2.1.4',
        downloadUrl: '/api/v1/ota/agent-bundle'
      }, req.user.username, 60_000);
      queued.push({ agentId: a.id, commandId: command.id });
    }
  }
  res.json({ queuedCount: queued.length, queued });
});

function requireDockerAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Docker management permission required' });
  }
  next();
}

// ==========================================
// Docker Fleet & Container Management APIs
// ==========================================
app.get('/api/v1/docker/hosts', authenticate, async (req, res) => {
  const isLocalAvail = await dockerManager.isAvailable();
  const hosts = [
    {
      id: 'local',
      name: 'Máy Chủ Trung Tâm (Local Docker)',
      ip: '127.0.0.1',
      isLocal: true,
      available: isLocalAvail,
      online: true
    }
  ];

  // Include approved LAN agents
  const agents = db.prepare("SELECT id, display_name, hostname, last_seen, capabilities_json FROM agents WHERE status = 'approved'").all();
  for (const a of agents) {
    const caps = parseJson(a.capabilities_json, []);
    const online = a.last_seen && Date.now() - Date.parse(a.last_seen) <= AGENT_OFFLINE_MS;
    hosts.push({
      id: a.id,
      name: a.display_name || a.hostname,
      ip: a.hostname,
      isLocal: false,
      available: online && caps.includes('docker'),
      online
    });
  }

  res.json({ hosts });
});

app.get('/api/v1/docker/:hostId/info', authenticate, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const info = await dockerManager.getSystemInfo();
      return res.json(info);
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.info', {}, 8000, req.user?.username);
    res.json(result || { available: false });
  } catch (err) {
    res.json({ available: false, error: err.message });
  }
});

app.get('/api/v1/docker/:hostId/containers', authenticate, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const containers = await dockerManager.listContainers({ all: req.query.all !== 'false' });
      return res.json({ containers });
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.containers', { all: req.query.all !== 'false' }, 10000, req.user?.username);
    res.json(result || { containers: [] });
  } catch (err) {
    res.json({ containers: [], error: err.message });
  }
});

app.get('/api/v1/docker/:hostId/containers/:id', authenticate, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const details = await dockerManager.getContainerDetails(req.params.id);
      return res.json(details);
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.container.details', { containerId: req.params.id }, 10000, req.user?.username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/docker/:hostId/containers/:id/stats', authenticate, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const stats = await dockerManager.getContainerStats(req.params.id);
      return res.json(stats);
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.container.stats', { containerId: req.params.id }, 10000, req.user?.username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/docker/:hostId/containers/:id/action', authenticate, requireDockerAdmin, async (req, res) => {
  try {
    const { action, options } = req.body || {};
    if (!action) return res.status(400).json({ error: 'Action required' });
    if (req.params.hostId === 'local') {
      await dockerManager.containerAction(req.params.id, action, options);
      return res.json({ success: true, action, containerId: req.params.id });
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.container.action', { containerId: req.params.id, action, options }, 15000, req.user?.username);
    res.json(result || { success: true, action, containerId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/docker/:hostId/containers/:id/logs', authenticate, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const logs = await dockerManager.getContainerLogs(req.params.id, { tail: req.query.tail || 200 });
      return res.json({ logs });
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.container.logs', { containerId: req.params.id, tail: Number(req.query.tail) || 200 }, 10000, req.user?.username);
    res.json(result || { logs: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/docker/:hostId/containers/:id/exec', authenticate, requireDockerAdmin, async (req, res) => {
  try {
    const cmd = Array.isArray(req.body.cmd) ? req.body.cmd : ['/bin/sh'];
    if (req.params.hostId === 'local') {
      const execId = await dockerManager.createExecInstance(req.params.id, { cmd, tty: true });
      return res.json({ success: true, execId });
    }
    res.status(400).json({ error: 'Remote agent live terminal exec is supported locally or through agent shell.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/docker/:hostId/stacks', authenticate, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const stacks = await dockerManager.listStacks();
      return res.json({ stacks });
    }
    const resContainers = await executeAgentCommand(req.params.hostId, 'docker.containers', { all: true }, 10000, req.user?.username);
    const containers = resContainers?.containers || [];
    const stackMap = new Map();
    containers.forEach(c => {
      const stackName = c.stack || 'Standalone';
      if (!stackMap.has(stackName)) {
        stackMap.set(stackName, { name: stackName, containers: [], containerCount: 0, runningCount: 0 });
      }
      const st = stackMap.get(stackName);
      st.containers.push(c);
      st.containerCount += 1;
      if (c.state === 'running') st.runningCount += 1;
    });
    res.json({ stacks: Array.from(stackMap.values()) });
  } catch (err) {
    res.json({ stacks: [] });
  }
});

app.get('/api/v1/docker/:hostId/images', authenticate, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const images = await dockerManager.listImages();
      return res.json({ images });
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.images', {}, 10000, req.user?.username);
    res.json(result || { images: [] });
  } catch (err) {
    res.json({ images: [] });
  }
});

app.post('/api/v1/docker/:hostId/images/prune', authenticate, requireDockerAdmin, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const result = await dockerManager.pruneImages();
      return res.json({ success: true, result });
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.prune', { type: 'images' }, 15000, req.user?.username);
    res.json(result || { success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/docker/:hostId/volumes', authenticate, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const volumes = await dockerManager.listVolumes();
      return res.json({ volumes });
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.volumes', {}, 10000, req.user?.username);
    res.json(result || { volumes: [] });
  } catch (err) {
    res.json({ volumes: [] });
  }
});

app.post('/api/v1/docker/:hostId/volumes/prune', authenticate, requireDockerAdmin, async (req, res) => {
  try {
    if (req.params.hostId === 'local') {
      const result = await dockerManager.pruneVolumes();
      return res.json({ success: true, result });
    }
    const result = await executeAgentCommand(req.params.hostId, 'docker.prune', { type: 'volumes' }, 15000, req.user?.username);
    res.json(result || { success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(staticPath, 'index.html')));

function cleanupData() {
  const now = Date.now();
  db.prepare('DELETE FROM telemetry WHERE ts < ?').run(new Date(now - TELEMETRY_RETENTION_MS).toISOString());
  db.prepare('DELETE FROM events WHERE occurred_at < ?').run(new Date(now - EVENT_RETENTION_MS).toISOString());
  db.prepare(`UPDATE commands SET status = 'expired', completed_at = ? WHERE status IN ('queued', 'sent', 'acknowledged') AND expires_at < ?`)
    .run(new Date().toISOString(), new Date().toISOString());
  db.prepare('DELETE FROM commands WHERE requested_at < ?').run(new Date(now - EVENT_RETENTION_MS).toISOString());

  const expiredScreenshots = db.prepare('SELECT id, file_path FROM screenshots WHERE created_at < ? ORDER BY created_at')
    .all(new Date(now - SCREENSHOT_RETENTION_MS).toISOString());
  for (const screenshot of expiredScreenshots) {
    try { fs.unlinkSync(screenshot.file_path); } catch {}
    db.prepare('DELETE FROM screenshots WHERE id = ?').run(screenshot.id);
  }

  let screenshots = db.prepare('SELECT id, file_path, size_bytes FROM screenshots ORDER BY created_at').all();
  let totalSize = screenshots.reduce((sum, item) => sum + item.size_bytes, 0);
  for (const screenshot of screenshots) {
    if (totalSize <= 1024 * 1024 * 1024) break;
    try { fs.unlinkSync(screenshot.file_path); } catch {}
    db.prepare('DELETE FROM screenshots WHERE id = ?').run(screenshot.id);
    totalSize -= screenshot.size_bytes;
  }
}

function backupDatabase() {
  const date = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(BACKUP_DIR, `windows-controller-${date}.db`);
  if (fs.existsSync(backupPath)) return;
  const sqlPath = backupPath.replace(/'/g, "''");
  try {
    db.exec(`VACUUM INTO '${sqlPath}'`);
  } catch (error) {
    console.error('Database backup failed:', error.message);
  }
}

setInterval(() => {
  const cutoff = Date.now() - AGENT_OFFLINE_MS;
  for (const [agentId, ws] of agentSockets) {
    if ((ws.lastSeenMs || 0) < cutoff) {
      ws.terminate();
      agentSockets.delete(agentId);
      broadcastUi('ui.host.status', serializeHost(getHost(agentId)));
    }
  }
}, 5_000).unref();

setInterval(() => {
  const now = new Date().toISOString();
  const expired = db.prepare(`SELECT id, agent_id FROM commands WHERE status IN ('queued', 'sent', 'acknowledged') AND expires_at < ?`).all(now);
  db.prepare(`UPDATE commands SET status = 'expired', completed_at = ? WHERE status IN ('queued', 'sent', 'acknowledged') AND expires_at < ?`).run(now, now);
  for (const command of expired) broadcastUi('ui.command', { commandId: command.id, status: 'expired' }, command.agent_id);
}, 5_000).unref();

setInterval(cleanupData, 60 * 60 * 1000).unref();
setInterval(backupDatabase, 24 * 60 * 60 * 1000).unref();
cleanupData();
backupDatabase();

server.listen(PORT, HOST, () => {
  console.log(`Windows Controller Central Server listening on http://${HOST}:${PORT}`);
  console.log(`Database: ${DB_FILE}`);
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0) {
    console.log('First-run setup required at /');
  }
});

function shutdown(exitCode = 0) {
  for (const ws of agentSockets.values()) ws.close(1001, 'server shutdown');
  for (const ws of uiClients) ws.close(1001, 'server shutdown');
  const finish = () => {
    try { db.close(); } catch {}
    process.exit(exitCode);
  };
  if (server.listening) server.close(finish);
  else finish();
  setTimeout(() => process.exit(exitCode), 5000).unref();
}

server.on('error', error => {
  console.error('Server error:', error);
  shutdown(1);
});
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  shutdown(1);
});
process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
  shutdown(1);
});
