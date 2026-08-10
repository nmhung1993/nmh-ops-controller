const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

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
    payload: { installId: 'install-test-1', token: 'agent-secret', hostname: 'TEST-HOST', fingerprint: 'fingerprint-1', platform: 'Windows test', version: '2.0.0', capabilities: ['telemetry'] }
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

  const closePromise = new Promise(resolve => agent.once('close', resolve));
  response = await fetch(`${baseUrl}/api/v1/agents/${agentId}/revoke`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 200);
  await closePromise;
});
