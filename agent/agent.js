const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const net = require('net');
const { execFileSync } = require('child_process');
const WebSocket = require('ws');
const {
  collectTelemetry,
  getProcesses,
  killProcess,
  launchServiceProcess,
  getMachineFingerprint,
  runPowerShell
} = require('./windows');

const VERSION = '2.1.5';
const DEFAULT_STATE_DIR = path.join(process.env.PROGRAMDATA || path.join(os.homedir(), 'AppData', 'Local'), 'WindowsController', 'agent');
const CONFIG_FILE = getArgument('--config') || process.env.WC_AGENT_CONFIG || path.join(DEFAULT_STATE_DIR, 'config.json');
const MAX_TELEMETRY_BUFFER = 300;
const MAX_EVENT_BUFFER = 1000;
const MAX_COMPLETED_COMMANDS = 500;
const CONNECTION_ATTEMPT_TIMEOUT_MS = Number(process.env.WC_CONNECTION_ATTEMPT_TIMEOUT_MS || 10_000);

function getDockerSocket() {
  if (process.platform === 'win32') {
    return { socketPath: '//./pipe/docker_engine' };
  }
  const candidates = ['/var/run/docker.sock', '/run/docker.sock'];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return { socketPath: p }; } catch {}
  }
  return null;
}

function dockerRequest(apiPath, method = 'GET', data = null, timeoutMs = 8000) {
  const sock = getDockerSocket();
  if (!sock) return Promise.reject(new Error('docker_socket_not_found'));
  return new Promise((resolve, reject) => {
    const payload = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
    const req = http.request({
      socketPath: sock.socketPath,
      path: apiPath,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`Docker API error ${res.statusCode}: ${body}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('docker_timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

let config;
let state;
let token;
let ws = null;
let approved = false;
let reconnectDelay = 1000;
let reconnectTimer = null;
let reconnectTimerAt = 0;
let connecting = false;
let connectionAttemptId = 0;
let connectionAttemptTimer = null;
let lastSocketActivityAt = 0;
let connectionStartedAt = 0;
let cachedFingerprint = null;
let telemetryRunning = false;
let watchdogRunning = false;
const watchdogCooldowns = new Map();

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

function protectSecret(value) {
  if (process.platform !== 'win32') return `plain:${Buffer.from(value).toString('base64')}`;
  const encoded = Buffer.from(value, 'utf8').toString('base64');
  const script = `
    Add-Type -AssemblyName System.Security
    $bytes = [Convert]::FromBase64String('${encoded}')
    $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
    [Convert]::ToBase64String($protected)
  `;
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }).trim();
}

function unprotectSecret(value) {
  if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8');
  const script = `
    Add-Type -AssemblyName System.Security
    $bytes = [Convert]::FromBase64String('${value.replace(/'/g, "''")}')
    $plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
    [Text.Encoding]::UTF8.GetString($plain)
  `;
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }).trim();
}

function saveState() {
  writeJsonAtomic(path.join(config.stateDir, 'state.json'), state);
}

function createEnvelope(type, payload = {}) {
  state.sequence += 1;
  return {
    type,
    messageId: `agent-msg-${crypto.randomUUID()}`,
    agentId: state.agentId || null,
    sentAt: new Date().toISOString(),
    seq: state.sequence,
    payload
  };
}

function sendRaw(message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(message));
  return true;
}

function queueTelemetry(message) {
  state.telemetryBuffer.push(message);
  if (state.telemetryBuffer.length > MAX_TELEMETRY_BUFFER) state.telemetryBuffer.shift();
  saveState();
}

function queueEvent(message) {
  state.eventBuffer.push(message);
  if (state.eventBuffer.length > MAX_EVENT_BUFFER) state.eventBuffer.shift();
  saveState();
}

function sendTelemetry(telemetry) {
  const message = createEnvelope('agent.telemetry', telemetry);
  if (!approved || !sendRaw(message)) queueTelemetry(message);
}

function sendEvent(eventType, severity, message, data = {}) {
  const frame = createEnvelope('agent.event', {
    eventType,
    severity,
    message,
    occurredAt: new Date().toISOString(),
    ...data
  });
  if (!approved || !sendRaw(frame)) queueEvent(frame);
}

function flushBuffers() {
  if (!approved || !ws || ws.readyState !== WebSocket.OPEN) return;
  const telemetry = state.telemetryBuffer.splice(0);
  const events = state.eventBuffer.splice(0);
  for (const message of telemetry) sendRaw(message);
  for (const message of events) sendRaw(message);
  saveState();
}

function wsUrl(serverUrl) {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/agent';
  url.search = '';
  return url.toString();
}

async function connect() {
  if (connecting || ws?.readyState === WebSocket.OPEN) return;
  connecting = true;
  connectionStartedAt = Date.now();
  const attemptId = ++connectionAttemptId;
  let socket;
  console.log(`Agent connecting to ${config.serverUrl}`);
  connectionAttemptTimer = setTimeout(() => {
    if (attemptId !== connectionAttemptId) return;
    console.warn('Agent connection attempt timed out; forcing reconnect.');
    connectionAttemptTimer = null;
    connectionAttemptId += 1;
    const staleSocket = ws;
    ws = null;
    connecting = false;
    approved = false;
    try { staleSocket?.terminate(); } catch {}
    scheduleReconnect();
  }, CONNECTION_ATTEMPT_TIMEOUT_MS);
  try {
    if (!cachedFingerprint) cachedFingerprint = await getMachineFingerprint();
    if (attemptId !== connectionAttemptId) return;
    socket = new WebSocket(wsUrl(config.serverUrl), { handshakeTimeout: 15_000 });
    ws = socket;
  } catch (error) {
    if (attemptId !== connectionAttemptId) return;
    if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer);
    connectionAttemptTimer = null;
    connecting = false;
    console.error('Agent connection setup failed:', error.message);
    scheduleReconnect();
    return;
  }

  socket.on('open', () => {
    if (attemptId !== connectionAttemptId) {
      try { socket.terminate(); } catch {}
      return;
    }
    connecting = false;
    lastSocketActivityAt = Date.now();
    console.log('Agent WebSocket opened; sending hello');
    sendRaw(createEnvelope('agent.hello', {
      installId: state.installId,
      token,
      hostname: os.hostname(),
      fingerprint: cachedFingerprint,
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
      version: VERSION,
      capabilities: ['telemetry', 'hardware-sensors', 'processes', 'process.kill', 'watchdog', 'watchdog.launch', 'service-launch', 'desktop-helper', 'window.capture', 'windows', 'system.execute', 'powershell', ...(getDockerSocket() ? ['docker'] : [])]
    }));
  });

  socket.on('message', raw => {
    lastSocketActivityAt = Date.now();
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.type === 'server.pending') {
      if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer);
      connectionAttemptTimer = null;
      reconnectDelay = 1000;
      approved = false;
      state.agentId = message.payload?.agentId || state.agentId;
      saveState();
      console.log(`Agent pending approval: ${state.agentId}`);
    } else if (message.type === 'server.approved') {
      if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer);
      connectionAttemptTimer = null;
      reconnectDelay = 1000;
      approved = true;
      state.agentId = message.payload?.agentId || state.agentId;
      saveState();
      flushBuffers();
      console.log(`Agent approved: ${state.agentId}`);
    } else if (message.type === 'server.config') {
      applyWatchdogConfig(message.payload || {});
    } else if (message.type === 'server.command') {
      executeCommand(message.payload || {});
    } else if (message.type === 'pong') {
      state.lastPongAt = new Date().toISOString();
    }
  });

  socket.on('close', (code, reason) => {
    if (ws !== socket) return;
    if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer);
    connectionAttemptTimer = null;
    ws = null;
    connecting = false;
    approved = false;
    if (code === 1001 && reason.toString().toLowerCase().includes('server shutdown')) reconnectDelay = 1000;
    console.log(`Agent disconnected (${code}): ${reason.toString()}`);
    scheduleReconnect();
  });

  socket.on('error', error => {
    console.error('Agent connection error:', error.message);
    if (ws !== socket) return;
    if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer);
    connectionAttemptTimer = null;
    connectionAttemptId += 1;
    ws = null;
    connecting = false;
    approved = false;
    try { socket.terminate(); } catch {}
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (ws?.readyState === WebSocket.OPEN) return;
  if (reconnectTimer && Date.now() - reconnectTimerAt < 45_000) return;
  if (reconnectTimer) {
    console.warn('Agent reconnect timer was stale; replacing it.');
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (connecting) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  reconnectTimerAt = Date.now();
  console.log(`Agent reconnect scheduled in ${delay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectTimerAt = 0;
    connect().catch(error => {
      console.error('Agent reconnect failed:', error.message);
      connecting = false;
      scheduleReconnect();
    });
  }, delay);
}

function maintainConnection() {
  if (connecting && connectionStartedAt && Date.now() - connectionStartedAt > 25_000) {
    console.warn('Agent connection state was stale; resetting it.');
    connecting = false;
    connectionAttemptId += 1;
    if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer);
    connectionAttemptTimer = null;
    const staleSocket = ws;
    ws = null;
    approved = false;
    try { staleSocket?.terminate(); } catch {}
    scheduleReconnect();
    return;
  }
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    scheduleReconnect();
    return;
  }
  if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.CLOSING) {
    if (connectionStartedAt && Date.now() - connectionStartedAt > 20_000) {
      const staleSocket = ws;
      ws = null;
      connecting = false;
      connectionAttemptId += 1;
      if (connectionAttemptTimer) clearTimeout(connectionAttemptTimer);
      connectionAttemptTimer = null;
      approved = false;
      try { staleSocket.terminate(); } catch {}
      scheduleReconnect();
    }
    return;
  }
  if (ws.readyState !== WebSocket.OPEN) return;
  if (lastSocketActivityAt && Date.now() - lastSocketActivityAt > 20_000) {
    console.warn('Agent connection timed out; reconnecting.');
    const staleSocket = ws;
    ws = null;
    connecting = false;
    approved = false;
    connectionAttemptId += 1;
    try { staleSocket.terminate(); } catch {}
    scheduleReconnect();
    return;
  }
  sendRaw(createEnvelope('ping'));
}

function applyWatchdogConfig(payload) {
  const version = Number(payload.version || 0);
  if (version < Number(state.watchdog.version || 0)) return;
  state.watchdog = {
    version,
    rules: Array.isArray(payload.rules) ? payload.rules : [],
    updatedAt: payload.updatedAt || new Date().toISOString()
  };
  saveState();
  sendRaw(createEnvelope('agent.config.ack', { version }));
}

function requestDesktop(action, payload = {}, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const helper = readJson(config.helperConfig || path.join(config.stateDir, 'helper.json'), null);
    if (!helper?.pipeName || !helper?.secret) return reject(new Error('interactive_session_unavailable'));
    const socket = net.createConnection(helper.pipeName);
    let handled = false;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('desktop_helper_timeout'));
    }, timeoutMs);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ id: crypto.randomUUID(), secret: helper.secret, action, payload })}\n`));
    socket.on('data', chunk => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0 || handled) return;
      handled = true;
      clearTimeout(timer);
      let response;
      try {
        response = JSON.parse(buffer.slice(0, newline));
      } catch {
        socket.destroy();
        return reject(new Error('desktop_helper_invalid_response'));
      }
      socket.end();
      if (response.ok) resolve(response.result || {});
      else reject(new Error(response.error === 'unauthorized' ? 'desktop_helper_secret_mismatch' : (response.error || 'desktop_helper_failed')));
    });
    socket.on('error', error => {
      clearTimeout(timer);
      reject(new Error(error.code === 'ENOENT' || error.code === 'ECONNREFUSED' ? 'interactive_session_unavailable' : error.message));
    });
  });
}

async function launchRule(rule) {
  if (!rule?.filePath) throw new Error('Watchdog rule has no executable path');
  if (rule.runMode === 'service') return launchServiceProcess(rule.filePath);
  return requestDesktop('launch', { filePath: rule.filePath });
}

async function manualLaunchRule(rule, commandId) {
  const processes = await getProcesses();
  const alreadyRunning = processes.some(process => process.name.toLowerCase() === rule.processName.toLowerCase());
  const captureScheduled = rule.runMode === 'interactive' && rule.captureAfterLaunch !== false;
  let launchResult = { alreadyRunning };
  if (!alreadyRunning) {
    launchResult = { ...(await launchRule(rule)), alreadyRunning: false };
  } else if (rule.runMode === 'interactive') {
    try {
      launchResult = { ...(await requestDesktop('activate', { processName: rule.processName })), alreadyRunning: true };
    } catch (error) {
      if (!['window_not_found', 'window_activation_failed'].includes(error.message)) throw error;
      launchResult = { ...(await launchRule(rule)), alreadyRunning: true, relaunchedForWindow: true };
    }
  }
  sendEvent(alreadyRunning ? 'process.manual.already_running' : 'process.manual.launch', 'info',
    alreadyRunning ? `Process ${rule.processName} is already running` : `Process ${rule.processName} was launched manually`,
    { ruleId: rule.id, processName: rule.processName, alreadyRunning, captureScheduled });
  if (captureScheduled) {
    const delay = launchResult.relaunchedForWindow ? 5_000 : (alreadyRunning ? 1_500 : 30_000);
    setTimeout(() => captureWindowWithRetry(rule.processName, commandId, 'manual.launch').catch(error => {
      sendEvent('process.manual.screenshot_failed', 'error', error.message, { ruleId: rule.id, processName: rule.processName });
    }), delay);
  }
  return { ...launchResult, captureScheduled };
}

async function captureWindow(processName, commandId = null, source = 'manual.capture') {
  const captureRoot = path.resolve(config.helperCaptureDir || path.join(path.dirname(config.helperConfig || config.stateDir), 'captures'));
  fs.mkdirSync(captureRoot, { recursive: true });
  const outputPath = path.join(captureRoot, `capture-${Date.now()}-${crypto.randomUUID()}.png`);
  await requestDesktop('capture', { processName, outputPath }, 45_000);
  const resolvedOutput = path.resolve(outputPath);
  if (!resolvedOutput.startsWith(`${captureRoot}${path.sep}`) || path.extname(resolvedOutput).toLowerCase() !== '.png') {
    throw new Error('Invalid screenshot path');
  }
  if (!fs.existsSync(resolvedOutput)) throw new Error('Screenshot file was not created');
  const buffer = fs.readFileSync(resolvedOutput);
  try { fs.unlinkSync(resolvedOutput); } catch {}
  const sent = sendRaw(createEnvelope('agent.screenshot', {
    commandId,
    processName,
    source,
    data: buffer.toString('base64')
  }));
  if (!sent) sendEvent('watchdog.screenshot.upload_failed', 'warning', 'Central Server is offline', { processName });
  return { sizeBytes: buffer.length };
}

async function captureWindowWithRetry(processName, commandId = null, source = 'manual.capture', attempts = 5, delayMs = 6_000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await captureWindow(processName, commandId, source);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function rememberCommand(commandId, responsePayload) {
  state.completedCommands[commandId] = responsePayload;
  const ids = Object.keys(state.completedCommands);
  while (ids.length > MAX_COMPLETED_COMMANDS) delete state.completedCommands[ids.shift()];
  saveState();
}

function sendCommandResult(commandId, status, result = null, error = null) {
  const payload = { commandId, status, result, error };
  sendRaw(createEnvelope('agent.command.result', payload));
  if (status === 'succeeded' || status === 'failed') rememberCommand(commandId, payload);
}

async function executeCommand(command) {
  const { commandId, commandType, data = {}, expiresAt } = command;
  if (!commandId || !commandType) return;
  if (state.completedCommands[commandId]) {
    sendRaw(createEnvelope('agent.command.result', state.completedCommands[commandId]));
    return;
  }
  if (expiresAt && Date.parse(expiresAt) < Date.now()) {
    sendCommandResult(commandId, 'failed', null, 'command_expired');
    return;
  }
  sendCommandResult(commandId, 'acknowledged');
  try {
    let result;
    if (commandType === 'process.list') {
      const processes = await getProcesses();
      sendRaw(createEnvelope('agent.processes', { processes }));
      result = { count: processes.length };
    } else if (commandType === 'process.kill') {
      result = { output: await killProcess(Number(data.pid)) };
    } else if (commandType === 'watchdog.launch') {
      const rule = state.watchdog.rules.find(item => item.id === data.ruleId);
      if (!rule) throw new Error('watchdog_rule_not_found');
      result = await manualLaunchRule(rule, commandId);
    } else if (commandType === 'window.capture') {
      result = await captureWindow(data.processName, commandId);
    } else if (commandType === 'system.execute') {
      const script = String(data.command || '').trim();
      if (!script) throw new Error('command_empty');
      const output = await runPowerShell(script, { timeout: 30_000 });
      result = { stdout: output };
    } else if (commandType === 'agent.upgrade') {
      const downloadPath = data.downloadUrl || '/api/v1/ota/agent-bundle';
      const bundleUrl = `${config.serverUrl.replace(/\/$/, '')}${downloadPath}`;
      console.log(`[Agent OTA] Downloading upgrade bundle from ${bundleUrl}...`);
      let bundle;
      if (typeof fetch === 'function') {
        const resp = await fetch(bundleUrl);
        if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
        bundle = await resp.json();
      } else {
        const httpLib = bundleUrl.startsWith('https:') ? https : http;
        bundle = await new Promise((res, rej) => {
          httpLib.get(bundleUrl, (r) => {
            let data = '';
            r.on('data', chunk => data += chunk);
            r.on('end', () => {
              try { res(JSON.parse(data)); } catch (e) { rej(e); }
            });
          }).on('error', rej);
        });
      }
      if (!bundle?.files || Object.keys(bundle.files).length === 0) {
        throw new Error('Upgrade bundle contains no files or could not be loaded from server');
      }
      for (const [filename, content] of Object.entries(bundle.files)) {
        const targetPath = path.join(__dirname, filename);
        fs.writeFileSync(targetPath, content, 'utf8');
      }
      result = { updated: true, newVersion: bundle.version || '2.1.5' };
      sendCommandResult(commandId, 'succeeded', result);
      sendEvent('agent.ota.restarting', 'info', `Agent successfully upgraded to v${bundle.version || '2.1.5'}. Restarting...`);
      setTimeout(() => {
        if (process.platform === 'win32') {
          try {
            const { spawn } = require('child_process');
            spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 1; Restart-Service WindowsControllerAgent -ErrorAction SilentlyContinue'], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true
            }).unref();
          } catch {}
        }
        process.exit(1);
      }, 1000);
      return;
    } else if (commandType === 'docker.info') {
      const info = await dockerRequest('/info');
      const ver = await dockerRequest('/version').catch(() => ({}));
      result = {
        available: true,
        containers: info.Containers || 0,
        containersRunning: info.ContainersRunning || 0,
        containersPaused: info.ContainersPaused || 0,
        containersStopped: info.ContainersStopped || 0,
        images: info.Images || 0,
        serverVersion: info.ServerVersion || ver.Version || 'unknown',
        operatingSystem: info.OperatingSystem || os.type(),
        architecture: info.Architecture || os.arch(),
        ncpu: info.NCPU || os.cpus().length,
        memTotal: info.MemTotal || os.totalmem()
      };
    } else if (commandType === 'docker.containers') {
      const all = data.all !== false;
      const rawContainers = await dockerRequest(`/containers/json?all=${all ? 1 : 0}`);
      const containers = (Array.isArray(rawContainers) ? rawContainers : []).map(c => ({
        id: c.Id,
        shortId: c.Id ? c.Id.slice(0, 12) : '',
        name: (c.Names?.[0] || '').replace(/^\//, ''),
        names: c.Names || [],
        image: c.Image,
        imageId: c.ImageID,
        command: c.Command,
        created: c.Created,
        state: c.State,
        status: c.Status,
        ports: c.Ports || [],
        labels: c.Labels || {},
        stack: c.Labels?.['com.docker.compose.project'] || c.Labels?.['io.portainer.stack.name'] || 'Standalone'
      }));
      result = { containers };
    } else if (commandType === 'docker.container.details') {
      const cid = encodeURIComponent(data.containerId);
      result = await dockerRequest(`/containers/${cid}/json`);
    } else if (commandType === 'docker.container.stats') {
      const cid = encodeURIComponent(data.containerId);
      const rawStats = await dockerRequest(`/containers/${cid}/stats?stream=false`);
      let cpuPercent = 0;
      let memPercent = 0;
      let memUsage = 0;
      let memLimit = 0;
      if (rawStats?.cpu_stats && rawStats?.precpu_stats) {
        const cpuDelta = (rawStats.cpu_stats.cpu_usage?.total_usage || 0) - (rawStats.precpu_stats.cpu_usage?.total_usage || 0);
        const sysDelta = (rawStats.cpu_stats.system_cpu_usage || 0) - (rawStats.precpu_stats.system_cpu_usage || 0);
        const cpus = rawStats.cpu_stats.online_cpus || os.cpus().length || 1;
        if (sysDelta > 0 && cpuDelta > 0) cpuPercent = Math.round(((cpuDelta / sysDelta) * cpus * 100) * 10) / 10;
      }
      if (rawStats?.memory_stats) {
        const cache = rawStats.memory_stats.stats?.cache || 0;
        memUsage = Math.max(0, (rawStats.memory_stats.usage || 0) - cache);
        memLimit = rawStats.memory_stats.limit || 1;
        memPercent = Math.round((memUsage / memLimit) * 1000) / 10;
      }
      result = { id: data.containerId, cpuPercent, memUsage, memLimit, memPercent, raw: rawStats };
    } else if (commandType === 'docker.container.action') {
      const cid = encodeURIComponent(data.containerId);
      const act = data.action;
      if (act === 'start') await dockerRequest(`/containers/${cid}/start`, 'POST');
      else if (act === 'stop') await dockerRequest(`/containers/${cid}/stop`, 'POST');
      else if (act === 'restart') await dockerRequest(`/containers/${cid}/restart`, 'POST');
      else if (act === 'pause') await dockerRequest(`/containers/${cid}/pause`, 'POST');
      else if (act === 'unpause') await dockerRequest(`/containers/${cid}/unpause`, 'POST');
      else if (act === 'remove') await dockerRequest(`/containers/${cid}?force=true`, 'DELETE');
      else throw new Error(`Unsupported docker action: ${act}`);
      result = { success: true, action: act, containerId: data.containerId };
    } else if (commandType === 'docker.container.logs') {
      const cid = encodeURIComponent(data.containerId);
      const tail = data.tail || 200;
      const logs = await dockerRequest(`/containers/${cid}/logs?stdout=1&stderr=1&tail=${tail}`);
      result = { logs: typeof logs === 'string' ? logs : JSON.stringify(logs) };
    } else if (commandType === 'docker.images') {
      const rawImages = await dockerRequest('/images/json');
      const images = (Array.isArray(rawImages) ? rawImages : []).map(img => ({
        id: img.Id,
        shortId: img.Id ? img.Id.replace('sha256:', '').slice(0, 12) : '',
        tags: img.RepoTags || ['<none>:<none>'],
        size: img.Size,
        created: img.Created,
        containers: img.Containers || 0
      }));
      result = { images };
    } else if (commandType === 'docker.volumes') {
      const rawVolumes = await dockerRequest('/volumes');
      const volumes = (rawVolumes?.Volumes || []).map(v => ({
        name: v.Name,
        driver: v.Driver,
        mountpoint: v.Mountpoint,
        createdAt: v.CreatedAt,
        labels: v.Labels || {}
      }));
      result = { volumes };
    } else if (commandType === 'docker.prune') {
      const type = data.type || 'all';
      let resPrune = {};
      if (type === 'images' || type === 'all') resPrune.images = await dockerRequest('/images/prune?all=1', 'POST').catch(() => null);
      if (type === 'containers' || type === 'all') resPrune.containers = await dockerRequest('/containers/prune', 'POST').catch(() => null);
      if (type === 'volumes' || type === 'all') resPrune.volumes = await dockerRequest('/volumes/prune', 'POST').catch(() => null);
      result = { success: true, pruned: type, result: resPrune };
    } else {
      throw new Error('unsupported_command');
    }
    sendCommandResult(commandId, 'succeeded', result);
  } catch (error) {
    if (commandType === 'watchdog.launch') {
      const rule = state.watchdog.rules.find(item => item.id === data.ruleId);
      sendEvent('process.manual.launch_failed', 'error', error.message, { ruleId: data.ruleId, processName: rule?.processName });
    }
    sendCommandResult(commandId, 'failed', null, error.message);
  }
}

async function collectTelemetryTick() {
  if (telemetryRunning) return;
  telemetryRunning = true;
  try {
    sendTelemetry(await collectTelemetry());
  } catch (error) {
    sendEvent('agent.telemetry.failed', 'warning', error.message);
  } finally {
    telemetryRunning = false;
  }
}

async function watchdogTick() {
  if (watchdogRunning || !state.watchdog.rules.length) return;
  watchdogRunning = true;
  try {
    const processes = await getProcesses();
    const names = new Set(processes.map(item => item.name.toLowerCase()));
    for (const rule of state.watchdog.rules) {
      if (!rule.enabled || names.has(rule.processName.toLowerCase())) continue;
      const lastAttempt = watchdogCooldowns.get(rule.id) || 0;
      if (Date.now() - lastAttempt < 30_000) continue;
      watchdogCooldowns.set(rule.id, Date.now());
      sendEvent('watchdog.process.down', 'error', `Process ${rule.processName} is not running`, { ruleId: rule.id, processName: rule.processName });
      try {
        await launchRule(rule);
        sendEvent('watchdog.process.relaunched', 'info', `Process ${rule.processName} was relaunched`, { ruleId: rule.id, processName: rule.processName });
        if (rule.runMode === 'interactive' && rule.captureAfterLaunch !== false) {
          setTimeout(() => captureWindowWithRetry(rule.processName, null, 'watchdog').catch(error => {
            sendEvent('watchdog.screenshot.failed', 'warning', error.message, { ruleId: rule.id, processName: rule.processName });
          }), 30_000);
        }
      } catch (error) {
        sendEvent('watchdog.process.relaunch_failed', 'error', error.message, { ruleId: rule.id, processName: rule.processName });
      }
    }
  } catch (error) {
    sendEvent('watchdog.check.failed', 'warning', error.message);
  } finally {
    watchdogRunning = false;
  }
}

function initialize() {
  config = readJson(CONFIG_FILE, null);
  if (!config?.serverUrl) {
    console.error(`Agent config not found or missing serverUrl: ${CONFIG_FILE}`);
    process.exit(1);
  }
  config.stateDir = config.stateDir || path.dirname(CONFIG_FILE);
  console.log(`Windows Controller Agent ${VERSION} starting; server=${config.serverUrl}`);
  fs.mkdirSync(config.stateDir, { recursive: true });
  const stateFile = path.join(config.stateDir, 'state.json');
  state = readJson(stateFile, {
    installId: crypto.randomUUID(),
    agentId: null,
    protectedToken: null,
    sequence: 0,
    telemetryBuffer: [],
    eventBuffer: [],
    completedCommands: {},
    watchdog: { version: 0, rules: [] },
    lastPongAt: null
  });
  if (!state.protectedToken) {
    token = crypto.randomBytes(32).toString('base64url');
    state.protectedToken = protectSecret(token);
  } else {
    token = unprotectSecret(state.protectedToken);
  }
  state.telemetryBuffer ||= [];
  state.eventBuffer ||= [];
  state.completedCommands ||= {};
  state.watchdog ||= { version: 0, rules: [] };
  state.sequence ||= 0;
  saveState();

  connect().catch(error => {
    console.error('Initial connection failed:', error.message);
    connecting = false;
    scheduleReconnect();
  });
  collectTelemetryTick();
  setInterval(collectTelemetryTick, 2_000);
  setInterval(watchdogTick, 10_000);
  setInterval(maintainConnection, 5_000);
}

initialize();
