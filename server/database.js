const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'windows-controller.db');

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      install_id TEXT NOT NULL UNIQUE,
      hostname TEXT NOT NULL,
      display_name TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      platform TEXT,
      version TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'revoked')),
      token_hash TEXT NOT NULL,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      approved_at TEXT,
      revoked_at TEXT,
      last_seen TEXT
    );

    CREATE TABLE IF NOT EXISTS latest_state (
      agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
      telemetry_json TEXT,
      processes_json TEXT,
      telemetry_at TEXT,
      processes_at TEXT
    );

    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      cpu_usage REAL,
      memory_percent REAL,
      payload_json TEXT NOT NULL,
      UNIQUE(agent_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_agent_ts ON telemetry(agent_id, ts);

    CREATE TABLE IF NOT EXISTS watchdog_configs (
      agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL DEFAULT '{"rules":[]}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      sent_at TEXT,
      acknowledged_at TEXT,
      completed_at TEXT,
      expires_at TEXT NOT NULL,
      result_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_commands_agent_requested ON commands(agent_id, requested_at DESC);

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      UNIQUE(agent_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_events_agent_occurred ON events(agent_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS screenshots (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      command_id TEXT,
      process_name TEXT,
      file_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  return db;
}

function getMeta(db, key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value || null;
}

function setMeta(db, key, value) {
  db.prepare(`
    INSERT INTO meta(key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function getSetting(db, key, fallback = '') {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
}

function setSetting(db, key, value) {
  db.prepare(`
    INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), new Date().toISOString());
}

function backupLegacyFiles() {
  const candidates = ['users.json', 'config.json', 'history.json'];
  const existing = candidates.filter(name => fs.existsSync(path.join(DATA_DIR, name)));
  if (existing.length === 0) return;

  const backupDir = path.join(DATA_DIR, 'legacy-backup');
  fs.mkdirSync(backupDir, { recursive: true });
  for (const name of existing) {
    const destination = path.join(backupDir, name);
    if (!fs.existsSync(destination)) {
      fs.copyFileSync(path.join(DATA_DIR, name), destination);
    }
  }
}

function migrateLegacyData(db) {
  if (getMeta(db, 'legacy_migrated') === '1') return;
  backupLegacyFiles();
  const now = new Date().toISOString();

  const users = parseJson(readOptional('users.json'), []);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users(username, password_hash, role, must_change_password, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const user of users) {
    if (user?.username && user?.password && ['admin', 'user'].includes(user.role)) {
      const knownDefault = (user.username === 'admin' || user.username === 'user' || user.username === 'seeder') ? 1 : 0;
      insertUser.run(user.username, user.password, user.role, knownDefault, now);
    }
  }

  const config = parseJson(readOptional('config.json'), null);
  if (config) {
    const rules = (config.monitoredProcesses || []).map((rule, index) => ({
      id: `legacy-${index + 1}`,
      processName: rule.processName,
      filePath: rule.filePath,
      enabled: rule.enabled !== false,
      runMode: 'interactive'
    }));
    setSetting(db, 'legacy_watchdog_config', JSON.stringify({ rules }));
    if (config.discordWebhook) setSetting(db, 'discord_webhook', config.discordWebhook);
  }

  const history = parseJson(readOptional('history.json'), []);
  if (Array.isArray(history) && history.length) {
    setSetting(db, 'legacy_history', JSON.stringify(history));
  }
  setSetting(db, 'server_hostname', os.hostname());
  setMeta(db, 'legacy_migrated', '1');
}

function readOptional(name) {
  try {
    return fs.readFileSync(path.join(DATA_DIR, name), 'utf8');
  } catch {
    return null;
  }
}

function attachLegacyDataToLocalAgent(db, agentId, hostname) {
  if (hostname.toLowerCase() !== getSetting(db, 'server_hostname', '').toLowerCase()) return;
  if (getMeta(db, 'legacy_attached') === '1') return;

  const config = getSetting(db, 'legacy_watchdog_config', '');
  if (config) {
    db.prepare(`
      INSERT INTO watchdog_configs(agent_id, version, config_json, updated_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(agent_id) DO NOTHING
    `).run(agentId, config, new Date().toISOString());
  }

  const history = parseJson(getSetting(db, 'legacy_history', ''), []);
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO events(message_id, agent_id, type, severity, payload_json, occurred_at, received_at)
    VALUES (?, ?, 'watchdog.legacy', ?, ?, ?, ?)
  `);
  for (const [index, item] of history.entries()) {
    const occurredAt = item.time || (item.lastAttempt ? new Date(item.lastAttempt).toISOString() : new Date().toISOString());
    insertEvent.run(`legacy-${index}-${item.lastAttempt || occurredAt}`, agentId,
      item.status === 'failed' ? 'error' : 'info', JSON.stringify(item), occurredAt, new Date().toISOString());
  }
  setMeta(db, 'legacy_attached', '1');
}

function rowToAgent(row) {
  if (!row) return null;
  return {
    ...row,
    capabilities: parseJson(row.capabilities_json, []),
    capabilities_json: undefined
  };
}

module.exports = {
  DATA_DIR,
  DB_FILE,
  createDatabase,
  getMeta,
  setMeta,
  getSetting,
  setSetting,
  migrateLegacyData,
  attachLegacyDataToLocalAgent,
  parseJson,
  rowToAgent
};
