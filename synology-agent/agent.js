'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const WebSocket = require('ws');

const VERSION = '2.1.4';
const CONFIG_FILE = argument('--config') || process.env.WC_AGENT_CONFIG || '/volume1/@appdata/windows-controller-agent/config.json';
const CONNECTION_ATTEMPT_TIMEOUT_MS = Number(process.env.WC_CONNECTION_ATTEMPT_TIMEOUT_MS || 10_000);
const capabilities = ['telemetry', 'hardware-sensors', 'processes', 'process.kill', 'watchdog', 'watchdog.launch', 'linux', 'synology'];
let config;
let state;
let socket = null;
let approved = false;
let reconnectDelay = 1000;
let reconnectTimer = null;
let reconnectTimerAt = 0;
let connectionAttemptTimer = null;
let connectionStartedAt = 0;
let lastActivityAt = 0;
let telemetryBusy = false;
let watchdogBusy = false;
let previousCpu = null;
let previousNetwork = null;

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}
function run(file, args = [], timeout = 15_000) {
  return new Promise((resolve, reject) => execFile(file, args, { encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
}
function envelope(type, payload = {}) {
  state.sequence += 1;
  return { type, messageId: `synology-${crypto.randomUUID()}`, agentId: state.agentId || null, sentAt: new Date().toISOString(), seq: state.sequence, payload };
}
function saveState() { writeJson(path.join(config.stateDir, 'state.json'), state); }
function send(frame) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(frame));
  return true;
}
function queue(name, frame, limit) {
  state[name].push(frame);
  if (state[name].length > limit) state[name].shift();
  saveState();
}
function emitEvent(eventType, severity, message, data = {}) {
  const frame = envelope('agent.event', { eventType, severity, message, occurredAt: new Date().toISOString(), ...data });
  if (!approved || !send(frame)) queue('eventBuffer', frame, 1000);
}
function flush() {
  if (!approved || socket?.readyState !== WebSocket.OPEN) return;
  for (const bufferName of ['telemetryBuffer', 'eventBuffer', 'resultBuffer']) {
    while (state[bufferName].length && send(state[bufferName][0])) state[bufferName].shift();
  }
  saveState();
}
function websocketUrl(serverUrl) {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/agent';
  url.search = '';
  return url.toString();
}
function fingerprint() {
  const candidates = ['/etc/machine-id', '/etc.defaults/synoinfo.conf', '/etc/synoinfo.conf'];
  const identity = candidates.map(file => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }).join('|') || `${os.hostname()}|${os.arch()}`;
  return crypto.createHash('sha256').update(identity).digest('hex');
}

function scheduleReconnect() {
  if (socket?.readyState === WebSocket.OPEN) return;
  if (reconnectTimer && Date.now() - reconnectTimerAt < 45_000) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  reconnectTimerAt = Date.now();
  console.log(`Synology Agent reconnect scheduled in ${delay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null; reconnectTimerAt = 0;
    try { connect(); }
    catch (error) { console.error('Synology Agent connection setup failed:', error.message); socket = null; scheduleReconnect(); }
  }, delay);
}
function failConnection(current, reason) {
  if (socket !== current) return;
  if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer);
  connectionAttemptTimer = null;
  socket = null; approved = false;
  console.error(`Synology Agent connection failed: ${reason}`);
  try { current.terminate(); } catch {}
  scheduleReconnect();
}
function connect() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  console.log(`Synology Agent connecting to ${config.serverUrl}`);
  const current = new WebSocket(websocketUrl(config.serverUrl), { handshakeTimeout: 15_000 });
  socket = current;
  connectionStartedAt = Date.now();
  connectionAttemptTimer = setTimeout(() => failConnection(current, 'connection_attempt_timeout'), CONNECTION_ATTEMPT_TIMEOUT_MS);
  current.on('open', () => {
    lastActivityAt = Date.now();
    console.log('Synology Agent WebSocket opened; sending hello');
    send(envelope('agent.hello', {
      installId: state.installId, token: state.token, hostname: os.hostname(), fingerprint: fingerprint(),
      platform: `Synology DSM / ${os.type()} ${os.release()} ${os.arch()}`, version: VERSION, capabilities
    }));
  });
  current.on('message', raw => {
    lastActivityAt = Date.now();
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'server.pending') {
      if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer); connectionAttemptTimer = null;
      reconnectDelay = 1000; approved = false; state.agentId = message.payload?.agentId || state.agentId; saveState();
      console.log(`Synology Agent pending approval: ${state.agentId}`);
    } else if (message.type === 'server.approved') {
      if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer); connectionAttemptTimer = null;
      reconnectDelay = 1000; approved = true; state.agentId = message.payload?.agentId || state.agentId; saveState(); flush();
      console.log(`Synology Agent approved: ${state.agentId}`);
    } else if (message.type === 'server.config') applyWatchdog(message.payload || {});
    else if (message.type === 'server.command') executeCommand(message.payload || {});
  });
  current.on('error', error => {
    console.error('Synology Agent connection error:', error.message);
    failConnection(current, error.message);
  });
  current.on('close', (code, reason) => {
    if (socket !== current) return;
    if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer);
    connectionAttemptTimer = null;
    socket = null; approved = false;
    if (code === 1001 && reason.toString().toLowerCase().includes('server shutdown')) reconnectDelay = 1000;
    console.log(`Synology Agent disconnected (${code}): ${reason.toString()}`);
    scheduleReconnect();
  });
}
function maintainConnection() {
  if (!socket || socket.readyState === WebSocket.CLOSED) return scheduleReconnect();
  if ([WebSocket.CONNECTING, WebSocket.CLOSING].includes(socket.readyState)) {
    if (Date.now() - connectionStartedAt > CONNECTION_ATTEMPT_TIMEOUT_MS) failConnection(socket, 'stale_connecting_socket');
    return;
  }
  if (Date.now() - lastActivityAt > 20_000) {
    return failConnection(socket, 'heartbeat_timeout');
  }
  send(envelope('ping'));
}

function cpuSnapshot() {
  const values = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  return { idle: (values[3] || 0) + (values[4] || 0), total: values.reduce((sum, value) => sum + value, 0) };
}
function cpuUsage() {
  const current = cpuSnapshot();
  if (!previousCpu) { previousCpu = current; return 0; }
  const total = current.total - previousCpu.total;
  const idle = current.idle - previousCpu.idle;
  previousCpu = current;
  return total > 0 ? Math.round((1 - idle / total) * 1000) / 10 : 0;
}
function memoryInfo() {
  const rows = Object.fromEntries(fs.readFileSync('/proc/meminfo', 'utf8').split('\n').filter(Boolean).map(line => {
    const [key, value] = line.split(':'); return [key, Number(value.trim().split(/\s+/)[0]) * 1024];
  }));
  const total = rows.MemTotal || os.totalmem();
  const available = rows.MemAvailable || rows.MemFree || os.freemem();
  const used = Math.max(0, total - available);
  return { total, used, free: available, percent: total ? Math.round(used / total * 1000) / 10 : 0 };
}
function networkInfo() {
  const totals = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2).reduce((result, line) => {
    const parts = line.trim().split(/[:\s]+/); if (parts.length < 10 || parts[0] === 'lo') return result;
    result.received += Number(parts[1] || 0); result.sent += Number(parts[9] || 0); return result;
  }, { received: 0, sent: 0 });
  const now = Date.now();
  if (!previousNetwork) { previousNetwork = { ...totals, at: now }; return { recvPerSecond: 0, sentPerSecond: 0 }; }
  const seconds = Math.max((now - previousNetwork.at) / 1000, 0.1);
  const result = { recvPerSecond: Math.max(0, Math.round((totals.received - previousNetwork.received) / seconds)), sentPerSecond: Math.max(0, Math.round((totals.sent - previousNetwork.sent) / seconds)) };
  previousNetwork = { ...totals, at: now }; return result;
}
async function disks() {
  try {
    const output = await run('df', ['-Pk']);
    return output.split('\n').slice(1).map(line => line.trim().split(/\s+/)).filter(parts => parts.length >= 6 && parts[5].startsWith('/volume')).map(parts => ({ drive: parts[5], total: Number(parts[1]) * 1024, used: Number(parts[2]) * 1024, free: Number(parts[3]) * 1024 }));
  } catch { return []; }
}
function hardwareSensors() {
  const temperatures = [];
  const powerParts = [];
  for (const base of ['/sys/class/thermal', '/sys/class/hwmon']) {
    let entries = [];
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch {}
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const folder = path.join(base, entry.name);
      let files = [];
      try { files = fs.readdirSync(folder); } catch { continue; }
      const name = (() => { try { return fs.readFileSync(path.join(folder, 'name'), 'utf8').trim(); } catch { return entry.name; } })();
      for (const file of files) {
        try {
          const raw = Number(fs.readFileSync(path.join(folder, file), 'utf8').trim());
          if (/^(temp|thermal_zone).*input$|^temp$/.test(file) && raw > 0) temperatures.push({ id: `${entry.name}-${file}`, type: 'system', name, celsius: Math.round((raw > 1000 ? raw / 1000 : raw) * 10) / 10, source: 'linux-sysfs' });
          if (/^power\d+_input$/.test(file) && raw >= 0) powerParts.push({ id: `${entry.name}-${file}`, type: 'system', name, watts: Math.round(raw / 1_000_000 * 100) / 100, source: 'linux-sysfs' });
        } catch {}
      }
    }
  }
  return { sampledAt: new Date().toISOString(), temperatures, power: { totalWatts: powerParts.length ? Math.round(powerParts.reduce((sum, item) => sum + item.watts, 0) * 100) / 100 : null, coverage: powerParts.length ? 'partial' : 'unavailable', parts: powerParts }, sources: ['linux-sysfs'] };
}
async function collectTelemetry() {
  return { sampledAt: new Date().toISOString(), cpu: { usage: cpuUsage(), model: os.cpus()[0]?.model || os.arch() }, memory: memoryInfo(), disk: await disks(), network: networkInfo(), uptime: os.uptime(), os: `${os.type()} ${os.release()}`, hardware: hardwareSensors() };
}
async function processes() {
  const output = await run('ps', ['-eo', 'pid=,comm=,pcpu=,rss=,args='], 20_000);
  return output.split('\n').filter(Boolean).map(line => line.trim().match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s*(.*)$/)).filter(Boolean).map(match => ({ pid: Number(match[1]), name: match[2], cpuPercent: Number(match[3]), memoryMB: Math.round(Number(match[4]) / 102.4) / 10, path: match[5] || '' }));
}
function applyWatchdog(payload) {
  if (Number(payload.version || 0) < Number(state.watchdog.version || 0)) return;
  state.watchdog = { version: Number(payload.version || 0), rules: Array.isArray(payload.rules) ? payload.rules : [], updatedAt: payload.updatedAt || new Date().toISOString() };
  saveState(); send(envelope('agent.config.ack', { version: state.watchdog.version }));
}
function launchRule(rule) {
  if (!rule?.filePath || !path.isAbsolute(rule.filePath)) throw new Error('invalid_executable_path');
  const child = spawn(rule.filePath, [], { detached: true, stdio: 'ignore' }); child.unref(); return { pid: child.pid };
}
function commandResult(commandId, status, result = null, error = null) {
  const frame = envelope('agent.command.result', { commandId, status, result, error });
  if (!approved || !send(frame)) queue('resultBuffer', frame, 1000);
  return frame;
}
async function executeCommand(payload) {
  const { commandId, commandType, data = {} } = payload;
  if (!commandId) return;
  const previous = state.completedCommands[commandId];
  if (previous) {
    commandResult(commandId, previous.status, previous.result || null, previous.error || null);
    return;
  }
  try {
    let result;
    if (commandType === 'process.list') { const list = await processes(); send(envelope('agent.processes', { processes: list })); result = { count: list.length }; }
    else if (commandType === 'process.kill') { process.kill(Number(data.pid), 'SIGTERM'); result = { pid: Number(data.pid) }; }
    else if (commandType === 'watchdog.launch') { const rule = state.watchdog.rules.find(item => item.id === data.ruleId); if (!rule) throw new Error('watchdog_rule_not_found'); result = launchRule(rule); }
    else throw new Error('unsupported_command');
    state.completedCommands[commandId] = { status: 'succeeded', result, error: null, at: new Date().toISOString() }; commandResult(commandId, 'succeeded', result);
  } catch (error) {
    state.completedCommands[commandId] = { status: 'failed', result: null, error: error.message, at: new Date().toISOString() };
    commandResult(commandId, 'failed', null, error.message);
  }
  const ids = Object.keys(state.completedCommands); for (const id of ids.slice(0, Math.max(0, ids.length - 500))) delete state.completedCommands[id]; saveState();
}
async function telemetryTick() {
  if (telemetryBusy) return; telemetryBusy = true;
  try { const frame = envelope('agent.telemetry', await collectTelemetry()); if (!approved || !send(frame)) queue('telemetryBuffer', frame, 300); }
  catch (error) { emitEvent('agent.telemetry.failed', 'warning', error.message); }
  finally { telemetryBusy = false; }
}
async function watchdogTick() {
  if (watchdogBusy || !state.watchdog.rules.length) return; watchdogBusy = true;
  try {
    const list = await processes(); const names = new Set(list.map(item => item.name.toLowerCase()));
    for (const rule of state.watchdog.rules.filter(item => item.enabled !== false)) {
      if (names.has(String(rule.processName || '').toLowerCase())) continue;
      try { const result = launchRule(rule); emitEvent('watchdog.process.relaunched', 'info', `Relaunched ${rule.processName}`, { ruleId: rule.id, processName: rule.processName, ...result }); }
      catch (error) { emitEvent('watchdog.process.relaunch_failed', 'error', error.message, { ruleId: rule.id, processName: rule.processName }); }
    }
  } catch (error) { emitEvent('watchdog.check.failed', 'warning', error.message); }
  finally { watchdogBusy = false; }
}

function initialize() {
  config = readJson(CONFIG_FILE, null);
  if (!config?.serverUrl) throw new Error(`Missing serverUrl in ${CONFIG_FILE}`);
  config.stateDir ||= path.join(path.dirname(CONFIG_FILE), 'state');
  console.log(`Synology Agent ${VERSION} starting; server=${config.serverUrl}`);
  state = readJson(path.join(config.stateDir, 'state.json'), null) || { installId: crypto.randomUUID(), agentId: null, token: crypto.randomBytes(32).toString('base64url'), sequence: 0, telemetryBuffer: [], eventBuffer: [], resultBuffer: [], completedCommands: {}, watchdog: { version: 0, rules: [] } };
  state.telemetryBuffer ||= []; state.eventBuffer ||= []; state.resultBuffer ||= []; state.completedCommands ||= {}; state.watchdog ||= { version: 0, rules: [] }; state.sequence ||= 0; saveState();
  connect(); telemetryTick(); setInterval(telemetryTick, 2000); setInterval(watchdogTick, 10_000); setInterval(maintainConnection, 5000);
}

process.on('uncaughtException', error => console.error(error.stack || error.message));
process.on('unhandledRejection', error => console.error(error?.stack || error));
initialize();
