const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

function waitForMessage(ws, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    const handler = raw => {
      const message = JSON.parse(raw.toString());
      if (message.type !== type) return;
      clearTimeout(timer);
      ws.off('message', handler);
      resolve(message);
    };
    ws.on('message', handler);
  });
}

async function waitForServer(url, child, output) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}\n${output()}`);
    try {
      const response = await fetch(`${url}/api/setup/status`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start\n${output()}`);
}

test('agent enrollment, telemetry, commands and revoke flow', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-central-test-'));
  const port = 38117;
  const baseUrl = `http://127.0.0.1:${port}`;
  const discordRequests = [];
  const discordServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      discordRequests.push({ headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(204).end();
    });
  });
  await new Promise(resolve => discordServer.listen(0, '127.0.0.1', resolve));
  const discordPort = discordServer.address().port;
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode === null) {
      await new Promise(resolve => {
        child.once('exit', resolve);
        child.kill();
      });
    }
    await new Promise(resolve => discordServer.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  await waitForServer(baseUrl, child, () => `${stdout}\n${stderr}`);
  let response = await fetch(`${baseUrl}/api/setup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'a-secure-test-password' })
  });
  assert.equal(response.status, 200, stderr);

  response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'a-secure-test-password' })
  });
  const login = await response.json();
  assert.ok(login.token);
  const headers = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' };
  response = await fetch(`${baseUrl}/api/v1/settings`, {
    method: 'PUT', headers, body: JSON.stringify({ discordWebhook: `http://127.0.0.1:${discordPort}/discord` })
  });
  assert.equal(response.status, 200);

  const agent = new WebSocket(`ws://127.0.0.1:${port}/ws/agent`);
  await new Promise((resolve, reject) => { agent.once('open', resolve); agent.once('error', reject); });
  const pendingPromise = waitForMessage(agent, 'server.pending');
  agent.send(JSON.stringify({
    type: 'agent.hello', messageId: 'hello-1', sentAt: new Date().toISOString(), seq: 1,
    payload: { installId: 'install-test-1', token: 'agent-secret', hostname: 'TEST-HOST', fingerprint: 'fingerprint-1', platform: 'Windows test', version: '2.0.0', capabilities: ['telemetry', 'processes'] }
  }));
  const pendingMessage = await pendingPromise;
  const agentId = pendingMessage.payload.agentId;

  response = await fetch(`${baseUrl}/api/v1/hosts`, { headers });
  assert.deepEqual(await response.json(), []);
  response = await fetch(`${baseUrl}/api/v1/agents/pending`, { headers });
  assert.equal((await response.json()).length, 1);

  const approvedPromise = waitForMessage(agent, 'server.approved');
  response = await fetch(`${baseUrl}/api/v1/agents/${agentId}/approve`, {
    method: 'POST', headers, body: JSON.stringify({ displayName: 'Test machine' })
  });
  assert.equal(response.status, 200);
  await approvedPromise;

  agent.send(JSON.stringify({
    type: 'agent.telemetry', messageId: 'telemetry-1', agentId, sentAt: new Date().toISOString(), seq: 2,
    payload: {
      timestamp: new Date().toISOString(), cpu: { usage: 12.5 }, memory: { percent: 44 }, disk: [], network: {},
      hardware: {
        temperatures: [{ id: 'gpu-0', type: 'gpu', name: 'Test GPU', celsius: 41, source: 'test' }],
        power: { totalWatts: 22.5, coverage: 'partial', parts: [{ id: 'gpu-0', type: 'gpu', name: 'Test GPU', watts: 22.5, limitWatts: 75, source: 'test' }] }
      }
    }
  }));
  await new Promise(resolve => setTimeout(resolve, 100));
  response = await fetch(`${baseUrl}/api/v1/hosts`, { headers });
  const hosts = await response.json();
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].displayName, 'Test machine');
  assert.equal(hosts[0].telemetry.cpu.usage, 12.5);
  assert.equal(hosts[0].telemetry.hardware.power.totalWatts, 22.5);

  agent.send(JSON.stringify({
    type: 'agent.event', messageId: 'manual-launch-event-1', agentId, sentAt: new Date().toISOString(), seq: 3,
    payload: { eventType: 'process.manual.launch', severity: 'info', message: 'Process DemoApp was launched manually', processName: 'DemoApp', captureScheduled: true }
  }));
  agent.send(JSON.stringify({
    type: 'agent.screenshot', messageId: 'manual-screenshot-1', agentId, sentAt: new Date().toISOString(), seq: 4,
    payload: { commandId: 'manual-command-1', processName: 'DemoApp', source: 'manual.launch', data: Buffer.from('test-png').toString('base64') }
  }));
  for (let attempt = 0; attempt < 30 && discordRequests.length < 1; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(discordRequests.length, 1, 'Successful interactive launch should send only its screenshot notification');
  assert.match(discordRequests[0].headers['content-type'], /multipart\/form-data/);
  assert.match(discordRequests[0].body.toString('utf8'), /Ảnh chụp cửa sổ/);

  agent.send(JSON.stringify({
    type: 'agent.event', messageId: 'manual-capture-failed-1', agentId, sentAt: new Date().toISOString(), seq: 5,
    payload: { eventType: 'process.manual.screenshot_failed', severity: 'error', message: 'window_not_found', processName: 'DemoApp' }
  }));
  for (let attempt = 0; attempt < 30 && discordRequests.length < 2; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(discordRequests.length, 2, 'A failed screenshot should send one Vietnamese error notification');
  assert.match(discordRequests[1].headers['content-type'], /application\/json/);
  const discordError = JSON.parse(discordRequests[1].body.toString('utf8')).content;
  assert.match(discordError, /Không thể chụp cửa sổ/);
  assert.doesNotMatch(discordError, /Process|Screenshot|window not found/i);

  response = await fetch(`${baseUrl}/api/v1/hosts/${agentId}`, { headers });
  assert.deepEqual((await response.json()).capabilities, ['telemetry', 'processes']);

  const commandPromise = waitForMessage(agent, 'server.command');
  response = await fetch(`${baseUrl}/api/v1/hosts/${agentId}/commands`, {
    method: 'POST', headers, body: JSON.stringify({ type: 'process.kill', payload: { pid: 1234 } })
  });
  assert.equal(response.status, 202);
  const command = await commandPromise;
  agent.send(JSON.stringify({
    type: 'agent.command.result', messageId: 'command-result-1', agentId, sentAt: new Date().toISOString(), seq: 3,
    payload: { commandId: command.payload.commandId, status: 'succeeded', result: { output: 'ok' } }
  }));
  await new Promise(resolve => setTimeout(resolve, 100));
  response = await fetch(`${baseUrl}/api/v1/hosts/${agentId}/commands`, { headers });
  assert.equal((await response.json())[0].status, 'succeeded');

  response = await fetch(`${baseUrl}/api/v1/hosts/${agentId}/commands`, {
    method: 'POST', headers, body: JSON.stringify({ type: 'window.capture', payload: { processName: 'DemoApp' } })
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'capability_not_supported');

  const closePromise = new Promise(resolve => agent.once('close', resolve));
  response = await fetch(`${baseUrl}/api/v1/agents/${agentId}/revoke`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 200);
  await closePromise;
});

test('host-scoped roles isolate machines and super admin can edit assignments', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-access-test-'));
  const port = 38118;
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.close();
    if (child.exitCode === null) {
      await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    }
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  await waitForServer(baseUrl, child, () => output);
  let response = await fetch(`${baseUrl}/api/setup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'root-admin', password: 'a-secure-root-password' })
  });
  assert.equal(response.status, 200);

  async function login(username, password = 'a-secure-test-password') {
    const result = await (await fetch(`${baseUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })).json();
    return { ...result, headers: { Authorization: `Bearer ${result.token}`, 'Content-Type': 'application/json' } };
  }

  const root = await login('root-admin', 'a-secure-root-password');
  assert.equal(root.role, 'super_admin');

  async function enroll(installId, hostname) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/agent`);
    sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const pending = waitForMessage(socket, 'server.pending');
    socket.send(JSON.stringify({
      type: 'agent.hello', messageId: `hello-${installId}`, sentAt: new Date().toISOString(), seq: 1,
      payload: { installId, token: `secret-${installId}`, hostname, fingerprint: `fingerprint-${installId}`, platform: 'Windows test', version: '2.0.0', capabilities: ['telemetry'] }
    }));
    return { socket, id: (await pending).payload.agentId };
  }

  async function approve(agent, displayName) {
    const approved = waitForMessage(agent.socket, 'server.approved');
    response = await fetch(`${baseUrl}/api/v1/agents/${agent.id}/approve`, {
      method: 'POST', headers: root.headers, body: JSON.stringify({ displayName })
    });
    assert.equal(response.status, 200);
    await approved;
  }

  const machineA = await enroll('install-a', 'HOST-A');
  const machineB = await enroll('install-b', 'HOST-B');
  await approve(machineA, 'Machine A');
  await approve(machineB, 'Machine B');

  async function createUser(username, role, hostIds) {
    response = await fetch(`${baseUrl}/api/v1/users`, {
      method: 'POST', headers: root.headers,
      body: JSON.stringify({ username, password: 'a-secure-test-password', role, hostIds })
    });
    assert.equal(response.status, 201);
  }
  await createUser('adminA', 'admin', [machineA.id]);
  await createUser('adminB', 'admin', [machineB.id]);
  await createUser('viewerA', 'viewer', [machineA.id]);

  const adminA = await login('adminA');
  const adminB = await login('adminB');
  const viewerA = await login('viewerA');
  assert.equal((await (await fetch(`${baseUrl}/api/v1/hosts`, { headers: adminA.headers })).json()).map(host => host.id).join(','), machineA.id);
  assert.equal((await (await fetch(`${baseUrl}/api/v1/hosts`, { headers: adminB.headers })).json()).map(host => host.id).join(','), machineB.id);
  assert.equal((await (await fetch(`${baseUrl}/api/v1/hosts`, { headers: viewerA.headers })).json()).map(host => host.id).join(','), machineA.id);

  response = await fetch(`${baseUrl}/api/v1/hosts/${machineB.id}`, { headers: adminA.headers });
  assert.equal(response.status, 404);
  response = await fetch(`${baseUrl}/api/v1/hosts/${machineB.id}/commands`, {
    method: 'POST', headers: adminA.headers, body: JSON.stringify({ type: 'process.kill', payload: { pid: 1234 } })
  });
  assert.equal(response.status, 404);
  response = await fetch(`${baseUrl}/api/v1/hosts/${machineA.id}/commands`, {
    method: 'POST', headers: viewerA.headers, body: JSON.stringify({ type: 'process.kill', payload: { pid: 1234 } })
  });
  assert.equal(response.status, 403);
  response = await fetch(`${baseUrl}/api/v1/users`, { headers: adminA.headers });
  assert.equal(response.status, 403);
  response = await fetch(`${baseUrl}/api/v1/settings`, { headers: adminA.headers });
  assert.equal(response.status, 403);

  const uiSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/ui?token=${encodeURIComponent(adminA.token)}`);
  sockets.push(uiSocket);
  const uiMessages = [];
  uiSocket.on('message', raw => uiMessages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => { uiSocket.once('open', resolve); uiSocket.once('error', reject); });
  uiSocket.send(JSON.stringify({ type: 'ui.subscribe', payload: { agentId: machineB.id } }));
  machineB.socket.send(JSON.stringify({
    type: 'agent.telemetry', messageId: 'telemetry-b-denied', agentId: machineB.id, sentAt: new Date().toISOString(), seq: 2,
    payload: { timestamp: new Date().toISOString(), cpu: { usage: 99 }, memory: { percent: 50 } }
  }));
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(uiMessages.some(message => message.type === 'ui.telemetry' && message.agentId === machineB.id), false);

  uiSocket.send(JSON.stringify({ type: 'ui.subscribe', payload: { agentId: machineA.id } }));
  const allowedTelemetry = waitForMessage(uiSocket, 'ui.telemetry');
  machineA.socket.send(JSON.stringify({
    type: 'agent.telemetry', messageId: 'telemetry-a-allowed', agentId: machineA.id, sentAt: new Date().toISOString(), seq: 2,
    payload: { timestamp: new Date().toISOString(), cpu: { usage: 25 }, memory: { percent: 40 } }
  }));
  assert.equal((await allowedTelemetry).agentId, machineA.id);

  const accessChanged = waitForMessage(uiSocket, 'ui.access.changed');
  response = await fetch(`${baseUrl}/api/v1/users/adminA`, {
    method: 'PUT', headers: root.headers, body: JSON.stringify({ role: 'admin', hostIds: [machineB.id] })
  });
  assert.equal(response.status, 200);
  assert.equal((await accessChanged).payload.role, 'admin');
  const reassignedHosts = await (await fetch(`${baseUrl}/api/v1/hosts`, { headers: adminA.headers })).json();
  assert.deepEqual(reassignedHosts.map(host => host.id), [machineB.id]);

  const users = await (await fetch(`${baseUrl}/api/v1/users`, { headers: root.headers })).json();
  assert.deepEqual(users.find(user => user.username === 'adminA').hostIds, [machineB.id]);
});

test('legacy admin roles migrate to super admin and preserve existing host access', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-role-migration-test-'));
  const db = new DatabaseSync(path.join(dataDir, 'windows-controller.db'));
  db.exec(`
    CREATE TABLE users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE agents (
      id TEXT PRIMARY KEY, install_id TEXT NOT NULL UNIQUE, hostname TEXT NOT NULL,
      display_name TEXT NOT NULL, fingerprint TEXT NOT NULL, platform TEXT, version TEXT,
      status TEXT NOT NULL, token_hash TEXT NOT NULL, capabilities_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, approved_at TEXT, revoked_at TEXT, last_seen TEXT
    );
  `);
  const passwordHash = bcrypt.hashSync('a-secure-test-password', 4);
  db.prepare('INSERT INTO users(username, password_hash, role, created_at) VALUES (?, ?, ?, ?)').run('old-admin', passwordHash, 'admin', '2024-01-01T00:00:00.000Z');
  db.prepare('INSERT INTO users(username, password_hash, role, created_at) VALUES (?, ?, ?, ?)').run('old-operator', passwordHash, 'admin', '2024-01-02T00:00:00.000Z');
  db.prepare('INSERT INTO users(username, password_hash, role, created_at) VALUES (?, ?, ?, ?)').run('old-viewer', passwordHash, 'user', '2024-01-03T00:00:00.000Z');
  db.prepare(`INSERT INTO agents(id, install_id, hostname, display_name, fingerprint, platform, version, status, token_hash, created_at, approved_at)
    VALUES ('legacy-agent', 'legacy-install', 'LEGACY-HOST', 'Legacy host', 'legacy-fingerprint', 'Windows', '2.0.0', 'approved', 'legacy-token', ?, ?)`)
    .run('2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  db.close();

  const port = 38119;
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  await waitForServer(baseUrl, child, () => output);

  async function login(username) {
    return (await fetch(`${baseUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'a-secure-test-password' })
    })).json();
  }
  const oldAdmin = await login('old-admin');
  const oldOperator = await login('old-operator');
  const oldViewer = await login('old-viewer');
  assert.equal(oldAdmin.role, 'super_admin');
  assert.equal(oldOperator.role, 'admin');
  assert.equal(oldViewer.role, 'viewer');
  const getHosts = async token => (await (await fetch(`${baseUrl}/api/v1/hosts`, { headers: { Authorization: `Bearer ${token}` } })).json()).map(host => host.id);
  assert.deepEqual(await getHosts(oldAdmin.token), ['legacy-agent']);
  assert.deepEqual(await getHosts(oldOperator.token), ['legacy-agent']);
  assert.deepEqual(await getHosts(oldViewer.token), ['legacy-agent']);
});
