const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const db = new DatabaseSync('/app/data/windows-controller.db');
const now = Date.now();
const iso = minutes => new Date(now - minutes * 60_000).toISOString();
const gib = 1024 ** 3;
const capabilities = ['telemetry', 'processes', 'watchdog', 'window.capture', 'desktop-helper'];

const agents = [
  {
    id: 'demo-agent-hcm-office', installId: 'demo-install-hcm-office', hostname: 'HCM-OPS-01', displayName: 'HCM Operations',
    fingerprint: 'DEMO-HCM-8F3A-91C2', platform: 'Windows 11 Pro 23H2', version: '2.4.0', notes: 'Máy điều phối mẫu tại văn phòng Hồ Chí Minh.',
    online: true, cpu: 43.7, memory: 61.4, temperature: 58.6, gpuTemperature: 63.9, power: 214.8, diskUsed: 298 * gib, diskTotal: 512 * gib
  },
  {
    id: 'demo-agent-design-studio', installId: 'demo-install-design-studio', hostname: 'DESIGN-RIG-07', displayName: 'Design Studio',
    fingerprint: 'DEMO-DSN-4B72-0DFA', platform: 'Windows 11 Pro 23H2', version: '2.4.0', notes: 'Máy dựng đồ họa mẫu, tải GPU cao để kiểm thử trạng thái cảnh báo.',
    online: true, cpu: 87.4, memory: 74.2, temperature: 71.8, gpuTemperature: 82.3, power: 486.2, diskUsed: 834 * gib, diskTotal: 1024 * gib
  },
  {
    id: 'demo-agent-warehouse-kiosk', installId: 'demo-install-warehouse-kiosk', hostname: 'WAREHOUSE-KIOSK-03', displayName: 'Warehouse Kiosk',
    fingerprint: 'DEMO-WHS-2E19-77AB', platform: 'Windows 10 IoT Enterprise', version: '2.3.7', notes: 'Thiết bị kiosk mẫu đang ngoại tuyến để kiểm thử trạng thái gián đoạn.',
    online: false, cpu: 12.8, memory: 38.9, temperature: 46.1, gpuTemperature: 0, power: 61.4, diskUsed: 54 * gib, diskTotal: 128 * gib
  }
];

function telemetry(agent, minutes, cpu, memory) {
  const temperatures = [{ id: 'cpu-package', type: 'cpu', name: 'CPU Package', celsius: Math.max(32, agent.temperature + (cpu - agent.cpu) * 0.22), source: 'LibreHardwareMonitor' }];
  if (agent.gpuTemperature) temperatures.push({ id: 'gpu-core', type: 'gpu', name: 'NVIDIA GPU Core', celsius: Math.max(32, agent.gpuTemperature + (cpu - agent.cpu) * 0.16), source: 'LibreHardwareMonitor' });
  return {
    timestamp: iso(minutes), os: agent.platform, uptime: 392_400 + Math.round(cpu * 60),
    cpu: { usage: Number(cpu.toFixed(1)), model: agent.id === 'demo-agent-design-studio' ? 'AMD Ryzen 9 7950X' : 'Intel Core i7-13700' },
    memory: { percent: Number(memory.toFixed(1)), used: Math.round(32 * gib * memory / 100), total: 32 * gib },
    disk: [{ drive: 'C:', used: agent.diskUsed, total: agent.diskTotal }, { drive: 'D:', used: Math.round(agent.diskTotal * 0.31), total: agent.diskTotal }],
    network: { recvPerSecond: Math.round(1.9 * 1024 * 1024 + cpu * 6800), sentPerSecond: Math.round(0.7 * 1024 * 1024 + memory * 4200) },
    hardware: {
      temperatures,
      power: {
        totalWatts: agent.power, coverage: 'complete',
        parts: [
          { id: 'cpu-power', type: 'cpu', name: 'CPU Package', watts: Number((agent.power * 0.42).toFixed(1)), source: 'LibreHardwareMonitor' },
          { id: 'gpu-power', type: 'gpu', name: 'GPU Board', watts: Number((agent.power * 0.58).toFixed(1)), source: 'LibreHardwareMonitor' }
        ]
      }
    }
  };
}

const processes = [
  { name: 'Controller.exe', pid: 4820, cpuPercent: 8.4, memoryMB: 216.7, path: 'C:\\Program Files\\Windows Controller\\Controller.exe' },
  { name: 'SyncWorker.exe', pid: 6392, cpuPercent: 3.1, memoryMB: 148.2, path: 'C:\\Program Files\\Windows Controller\\SyncWorker.exe' },
  { name: 'msedge.exe', pid: 9128, cpuPercent: 12.7, memoryMB: 842.5, path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'Teams.exe', pid: 10724, cpuPercent: 2.3, memoryMB: 388.9, path: 'C:\\Users\\demo\\AppData\\Local\\Microsoft\\Teams\\current\\Teams.exe' }
];

db.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;');
try {
  db.prepare('DELETE FROM user_host_access WHERE username = ? OR agent_id LIKE ?').run('demo-admin', 'demo-%');
  for (const table of ['commands', 'events', 'telemetry', 'watchdog_configs', 'latest_state']) db.prepare(`DELETE FROM ${table} WHERE agent_id LIKE ?`).run('demo-%');
  db.prepare('DELETE FROM agents WHERE id LIKE ?').run('demo-%');
  db.prepare('DELETE FROM users WHERE username = ?').run('demo-admin');

  db.prepare('INSERT INTO users(username, password_hash, role, must_change_password, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('demo-admin', bcrypt.hashSync('demo-password-2026', 12), 'super_admin', 0, iso(120));

  const insertAgent = db.prepare('INSERT INTO agents(id, install_id, hostname, display_name, fingerprint, platform, version, notes, status, token_hash, capabilities_json, created_at, approved_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertState = db.prepare('INSERT INTO latest_state(agent_id, telemetry_json, processes_json, telemetry_at, processes_at) VALUES (?, ?, ?, ?, ?)');
  const insertTelemetry = db.prepare('INSERT INTO telemetry(agent_id, message_id, ts, cpu_usage, memory_percent, payload_json) VALUES (?, ?, ?, ?, ?, ?)');

  for (const agent of agents) {
    const lastMinutes = agent.online ? 0.08 : 55;
    const latest = telemetry(agent, lastMinutes, agent.cpu, agent.memory);
    insertAgent.run(agent.id, agent.installId, agent.hostname, agent.displayName, agent.fingerprint, agent.platform, agent.version, agent.notes, 'approved', `demo-token-hash-${agent.id}`, JSON.stringify(capabilities), iso(720), iso(700), iso(lastMinutes));
    insertState.run(agent.id, JSON.stringify(latest), JSON.stringify(agent.id === 'demo-agent-hcm-office' ? processes : processes.slice(0, 2)), latest.timestamp, iso(lastMinutes));
    if (agent.id === 'demo-agent-hcm-office') {
      for (let point = 11; point >= 0; point -= 1) {
        const cpu = 31 + ((point * 11) % 29) + (point === 2 ? 11 : 0);
        const memory = 52 + ((point * 7) % 14);
        const sample = telemetry(agent, point * 5, cpu, memory);
        insertTelemetry.run(agent.id, `demo-telemetry-hcm-${point}`, sample.timestamp, sample.cpu.usage, sample.memory.percent, JSON.stringify(sample));
      }
    } else insertTelemetry.run(agent.id, `demo-telemetry-${agent.id}`, latest.timestamp, latest.cpu.usage, latest.memory.percent, JSON.stringify(latest));
  }

  const rules = {
    rules: [
      { id: 'demo-rule-controller', processName: 'Controller.exe', filePath: 'C:\\Program Files\\Windows Controller\\Controller.exe', runMode: 'interactive', enabled: true, captureAfterLaunch: true },
      { id: 'demo-rule-sync', processName: 'SyncWorker.exe', filePath: 'C:\\Program Files\\Windows Controller\\SyncWorker.exe', runMode: 'service', enabled: false, captureAfterLaunch: false }
    ]
  };
  db.prepare('INSERT INTO watchdog_configs(agent_id, version, config_json, updated_at) VALUES (?, ?, ?, ?)').run('demo-agent-hcm-office', 4, JSON.stringify(rules), iso(18));

  const insertEvent = db.prepare('INSERT INTO events(message_id, agent_id, type, severity, payload_json, occurred_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertEvent.run('demo-event-restarted', 'demo-agent-hcm-office', 'watchdog.process.relaunched', 'success', JSON.stringify({ eventType: 'watchdog.process.relaunched', severity: 'success', processName: 'Controller.exe', message: 'Controller.exe restarted successfully after health check.' }), iso(14), iso(14));
  insertEvent.run('demo-event-down', 'demo-agent-hcm-office', 'watchdog.process.down', 'warning', JSON.stringify({ eventType: 'watchdog.process.down', severity: 'warning', processName: 'SyncWorker.exe', message: 'SyncWorker.exe stopped responding for 90 seconds.' }), iso(29), iso(29));
  insertEvent.run('demo-event-manual', 'demo-agent-hcm-office', 'process.manual.launch', 'info', JSON.stringify({ eventType: 'process.manual.launch', severity: 'info', processName: 'Controller.exe', message: 'Controller.exe was launched manually by the operator.' }), iso(46), iso(46));

  const insertCommand = db.prepare('INSERT INTO commands(id, agent_id, type, payload_json, status, requested_by, requested_at, sent_at, acknowledged_at, completed_at, expires_at, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertCommand.run('demo-command-process-list', 'demo-agent-hcm-office', 'process.list', '{}', 'succeeded', 'demo-admin', iso(9), iso(9), iso(9), iso(8), iso(-51), JSON.stringify({ output: '4 processes collected' }));
  insertCommand.run('demo-command-capture', 'demo-agent-hcm-office', 'window.capture', JSON.stringify({ processName: 'Controller.exe' }), 'succeeded', 'demo-admin', iso(38), iso(38), iso(38), iso(37), iso(5), JSON.stringify({ output: 'Window captured' }));

  db.exec('COMMIT;');
  console.log(JSON.stringify({ seeded: true, username: 'demo-admin', password: 'demo-password-2026', hosts: agents.map(agent => agent.displayName) }));
} catch (error) {
  try { db.exec('ROLLBACK;'); } catch {}
  throw error;
} finally {
  db.close();
}