'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const WebSocket = require('ws');

const VERSION = '1.0.2';
const CONFIG_FILE = argument('--config') || '/data/options.json';
const STATE_FILE = process.env.WC_STATE_FILE || path.join(path.dirname(CONFIG_FILE), 'windows-controller-state.json');
const capabilities = ['telemetry', 'hardware-sensors', 'homeassistant', 'homeassistant.entities'];
let config;
let state;
let socket = null;
let approved = false;
let reconnectDelay = 1000;
let reconnectTimer = null;
let connectionStartedAt = 0;
let lastActivityAt = 0;
let telemetryBusy = false;

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function saveState() {
  const temporary = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, STATE_FILE);
}
function envelope(type, payload = {}) {
  state.sequence += 1;
  return { type, messageId: `homeassistant-${crypto.randomUUID()}`, agentId: state.agentId || null, sentAt: new Date().toISOString(), seq: state.sequence, payload };
}
function send(frame) { if (!socket || socket.readyState !== WebSocket.OPEN) return false; socket.send(JSON.stringify(frame)); return true; }
function websocketUrl(serverUrl) { const url = new URL(serverUrl); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.pathname = '/ws/agent'; url.search = ''; return url.toString(); }
function scheduleReconnect() {
  if (reconnectTimer || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  const delay = reconnectDelay; reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
}
function fingerprint() {
  const identity = `${config.home_assistant_url}|${state.installId}`;
  return crypto.createHash('sha256').update(identity).digest('hex');
}
function connect() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  const current = new WebSocket(websocketUrl(config.central_server_url), { handshakeTimeout: 15_000 });
  socket = current; connectionStartedAt = Date.now();
  current.on('open', () => {
    lastActivityAt = Date.now();
    send(envelope('agent.hello', { installId: state.installId, token: state.token, hostname: state.hostname, fingerprint: fingerprint(), platform: 'Home Assistant', version: VERSION, capabilities }));
  });
  current.on('message', raw => {
    lastActivityAt = Date.now();
    let message; try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'server.pending') { reconnectDelay = 1000; approved = false; state.agentId = message.payload?.agentId || state.agentId; saveState(); console.log(`Home Assistant connector pending approval: ${state.agentId}`); }
    else if (message.type === 'server.approved') { reconnectDelay = 1000; approved = true; state.agentId = message.payload?.agentId || state.agentId; saveState(); flush(); console.log(`Home Assistant connector approved: ${state.agentId}`); }
    else if (message.type === 'server.config') send(envelope('agent.config.ack', { version: Number(message.payload?.version || 0) }));
    else if (message.type === 'server.command') send(envelope('agent.command.result', { commandId: message.payload?.commandId, status: 'failed', error: 'capability_not_supported' }));
  });
  current.on('error', error => console.error('Home Assistant connector error:', error.message));
  current.on('close', (code, reason) => { if (socket !== current) return; socket = null; approved = false; console.log(`Home Assistant connector disconnected (${code}): ${reason.toString()}`); scheduleReconnect(); });
}
function maintainConnection() {
  if (!socket || socket.readyState === WebSocket.CLOSED) return scheduleReconnect();
  if ([WebSocket.CONNECTING, WebSocket.CLOSING].includes(socket.readyState)) {
    if (Date.now() - connectionStartedAt > 20_000) { const stale = socket; socket = null; try { stale.terminate(); } catch {} scheduleReconnect(); }
    return;
  }
  if (Date.now() - lastActivityAt > 20_000) return socket.terminate();
  send(envelope('ping'));
}
function queue(frame) { state.telemetryBuffer.push(frame); if (state.telemetryBuffer.length > 120) state.telemetryBuffer.shift(); saveState(); }
function flush() {
  if (!approved || socket?.readyState !== WebSocket.OPEN) return;
  while (state.telemetryBuffer.length && send(state.telemetryBuffer[0])) state.telemetryBuffer.shift();
  saveState();
}

function apiUrl(endpoint) { return `${config.home_assistant_url.replace(/\/$/, '')}/api/${endpoint.replace(/^\//, '')}`; }
async function homeAssistantApi(endpoint) {
  const supervisorUrl = /^https?:\/\/supervisor(?:\/|$)/i.test(config.home_assistant_url);
  const token = supervisorUrl
    ? (process.env.SUPERVISOR_TOKEN || config.home_assistant_token)
    : (config.home_assistant_token || process.env.SUPERVISOR_TOKEN);
  if (!token) throw new Error('home_assistant_token_missing');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (supervisorUrl) headers['X-Supervisor-Token'] = token;
  const response = await fetch(apiUrl(endpoint), { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(supervisorUrl
        ? 'home_assistant_http_401_supervisor_token_rejected'
        : 'home_assistant_http_401_use_long_lived_token');
    }
    throw new Error(`home_assistant_http_${response.status}`);
  }
  return response.json();
}
function numericState(entity) { const value = Number(entity?.state); return Number.isFinite(value) ? value : null; }
function byId(entities, entityId) { return entityId ? entities.find(entity => entity.entity_id === entityId) : null; }
function autoEntity(entities, patterns) { return entities.find(entity => patterns.some(pattern => pattern.test(entity.entity_id)) && numericState(entity) !== null); }
function selectedEntities(entities, ids) { return (Array.isArray(ids) ? ids : []).map(id => byId(entities, id)).filter(Boolean); }
function watts(entity) {
  const value = numericState(entity); if (value === null) return null;
  const unit = String(entity.attributes?.unit_of_measurement || 'W').toLowerCase();
  if (unit === 'kw') return value * 1000;
  if (unit === 'mw') return value / 1000;
  return value;
}
async function collectTelemetry() {
  const [haConfig, entities] = await Promise.all([homeAssistantApi('config'), homeAssistantApi('states')]);
  const cpuEntity = byId(entities, config.cpu_entity_id) || autoEntity(entities, [/processor_use/i, /cpu.*(usage|percent)/i]);
  const memoryEntity = byId(entities, config.memory_entity_id) || autoEntity(entities, [/memory.*(use_percent|usage_percent)/i, /memory.*percent/i]);
  const powerEntities = selectedEntities(entities, config.power_entity_ids);
  const temperatureEntities = selectedEntities(entities, config.temperature_entity_ids);
  const powerParts = powerEntities.map(entity => ({ id: entity.entity_id, type: 'homeassistant', name: entity.attributes?.friendly_name || entity.entity_id, watts: watts(entity), source: 'home-assistant' })).filter(item => item.watts !== null);
  const temperatures = temperatureEntities.map(entity => ({ id: entity.entity_id, type: 'homeassistant', name: entity.attributes?.friendly_name || entity.entity_id, celsius: numericState(entity), source: 'home-assistant' })).filter(item => item.celsius !== null);
  const unavailable = entities.filter(entity => ['unavailable', 'unknown'].includes(entity.state)).length;
  const cpu = numericState(cpuEntity);
  const memory = numericState(memoryEntity);
  return {
    sampledAt: new Date().toISOString(),
    cpu: { usage: cpu === null ? 0 : Math.max(0, Math.min(100, cpu)), model: 'Home Assistant host' },
    memory: { total: 0, used: 0, free: 0, percent: memory === null ? 0 : Math.max(0, Math.min(100, memory)) },
    disk: [], network: { recvPerSecond: 0, sentPerSecond: 0 }, uptime: os.uptime(), os: `Home Assistant ${haConfig.version || ''}`.trim(),
    hardware: { sampledAt: new Date().toISOString(), temperatures, power: { totalWatts: powerParts.length ? Math.round(powerParts.reduce((sum, item) => sum + item.watts, 0) * 100) / 100 : null, coverage: powerParts.length ? 'configured-entities' : 'unavailable', parts: powerParts }, sources: ['home-assistant'] },
    homeAssistant: { version: haConfig.version || null, locationName: haConfig.location_name || null, timeZone: haConfig.time_zone || null, entityCount: entities.length, unavailableEntityCount: unavailable }
  };
}
async function telemetryTick() {
  if (telemetryBusy) return; telemetryBusy = true;
  try { const frame = envelope('agent.telemetry', await collectTelemetry()); if (!approved || !send(frame)) queue(frame); }
  catch (error) { console.error('Home Assistant telemetry failed:', error.message); }
  finally { telemetryBusy = false; }
}

function initialize() {
  config = readJson(CONFIG_FILE, null);
  if (!config?.central_server_url || !config?.home_assistant_url) throw new Error(`Invalid add-on options in ${CONFIG_FILE}`);
  state = readJson(STATE_FILE, null) || { installId: crypto.randomUUID(), agentId: null, token: crypto.randomBytes(32).toString('base64url'), hostname: `homeassistant-${os.hostname()}`, sequence: 0, telemetryBuffer: [] };
  state.telemetryBuffer ||= []; state.sequence ||= 0; saveState();
  connect(); telemetryTick(); setInterval(telemetryTick, Math.max(2, Number(config.telemetry_interval_seconds || 5)) * 1000); setInterval(maintainConnection, 5000);
}

process.on('uncaughtException', error => console.error(error.stack || error.message));
process.on('unhandledRejection', error => console.error(error?.stack || error));
initialize();
