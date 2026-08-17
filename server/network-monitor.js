const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const dns = require('dns');
const querystring = require('querystring');
const express = require('express');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const TARGETS_FILE = path.join(DATA_DIR, 'network-targets.json');
const LOGS_FILE = path.join(DATA_DIR, 'network-logs.json');
const ROUTER_CONFIG_FILE = path.join(DATA_DIR, 'xiaomi-config.json');
const SCAN_HISTORY_FILE = path.join(DATA_DIR, 'network-scan-history.json');

// Default targets with updated Node 2 IP 192.168.31.120
const DEFAULT_TARGETS = [
  { id: 't_gateway', name: 'Xiaomi Router CR8806 (Gateway)', host: '192.168.31.1', tag: 'Router', interval: 3000, enabled: true },
  { id: 't_mesh_120', name: 'Xiaomi Mesh Node 2', host: '192.168.31.120', tag: 'Mesh', interval: 3000, enabled: true },
  { id: 't_mesh_196', name: 'Xiaomi Mesh Node 3', host: '192.168.31.196', tag: 'Mesh', interval: 3000, enabled: true },
  { id: 't_server', name: 'Local Server (Host)', host: '127.0.0.1', tag: 'Server', interval: 3000, enabled: true },
  { id: 't_google', name: 'Google Public DNS', host: '8.8.8.8', tag: 'Cloud', interval: 3000, enabled: true },
  { id: 't_cloudflare', name: 'Cloudflare DNS', host: '1.1.1.1', tag: 'Cloud', interval: 3000, enabled: true }
];

let targets = [];
let scanHistory = [];
let activePings = new Map();
let scanState = { isScanning: false, current: 0, total: 254, abort: false, results: [] };
let pingInterval = null;

function loadJson(file, defaultValue) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.error(`Failed to load ${file}:`, err.message);
  }
  return defaultValue;
}

function saveJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save ${file}:`, err.message);
  }
}

// Load targets & scan history
targets = loadJson(TARGETS_FILE, DEFAULT_TARGETS);
scanHistory = loadJson(SCAN_HISTORY_FILE, []);

// Update node 2 from 119 to 120 if old entry exists
const oldNode2 = targets.find(t => t.host === '192.168.31.119' || t.name.includes('Node 2'));
if (oldNode2 && oldNode2.host === '192.168.31.119') {
  oldNode2.host = '192.168.31.120';
  saveJson(TARGETS_FILE, targets);
}

targets.forEach(t => {
  if (t.status === undefined) t.status = 'unknown';
  if (t.enabled === undefined) t.enabled = true;
  if (t.latency === undefined) t.latency = null;
  if (t.packetLoss === undefined) t.packetLoss = 0;
  if (t.minLatency === undefined) t.minLatency = null;
  if (t.maxLatency === undefined) t.maxLatency = null;
  if (t.avgLatency === undefined) t.avgLatency = null;
  if (!Array.isArray(t.history)) t.history = [];
  if (t.totalPings === undefined) t.totalPings = 0;
  if (t.failedPings === undefined) t.failedPings = 0;
  if (t.lastCheck === undefined) t.lastCheck = null;
});

// Ping execution helper
function pingHost(host, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = 'ping';
    const args = isWindows
      ? ['-n', '1', '-w', String(timeoutMs), host]
      : ['-c', '1', '-W', String(Math.ceil(timeoutMs / 1000)), host];

    const startTime = Date.now();
    const proc = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let resolved = false;

    proc.stdout.on('data', chunk => stdout += chunk);

    const finish = (alive, latency) => {
      if (resolved) return;
      resolved = true;
      resolve({ alive, latency: alive ? (latency || (Date.now() - startTime)) : null });
    };

    proc.on('close', (code) => {
      if (code === 0) {
        let latency = null;
        const match = stdout.match(/time[=<](\d+(?:\.\d+)?)\s*ms/i) || stdout.match(/time=(\d+(?:\.\d+)?)ms/i);
        if (match) latency = parseFloat(match[1]);
        finish(true, latency !== null ? Math.round(latency) : 1);
      } else {
        finish(false, null);
      }
    });

    proc.on('error', () => finish(false, null));

    setTimeout(() => {
      try { proc.kill(); } catch (e) {}
      finish(false, null);
    }, timeoutMs + 500);
  });
}

// Update single target ping
async function executePing(target) {
  if (!target.enabled || activePings.get(target.id)) return;
  activePings.set(target.id, true);

  try {
    const res = await pingHost(target.host, 2000);
    const now = new Date().toISOString();
    target.lastCheck = now;
    target.totalPings = (target.totalPings || 0) + 1;

    if (res.alive) {
      target.latency = res.latency;
      target.status = res.latency > 150 ? 'degraded' : 'online';
      target.minLatency = target.minLatency === null ? res.latency : Math.min(target.minLatency, res.latency);
      target.maxLatency = target.maxLatency === null ? res.latency : Math.max(target.maxLatency, res.latency);
    } else {
      target.latency = null;
      target.status = 'offline';
      target.failedPings = (target.failedPings || 0) + 1;
    }

    target.packetLoss = target.totalPings > 0
      ? Math.round((target.failedPings / target.totalPings) * 100)
      : 0;

    target.history = target.history || [];
    target.history.push({
      time: now,
      latency: res.latency,
      status: target.status
    });
    if (target.history.length > 30) target.history.shift();

    const validPings = target.history.filter(h => h.latency !== null);
    target.avgLatency = validPings.length > 0
      ? Math.round(validPings.reduce((sum, h) => sum + h.latency, 0) / validPings.length)
      : null;

  } finally {
    activePings.set(target.id, false);
  }
}

// Background ping loop
function startPingEngine() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    targets.forEach(target => {
      if (target.enabled) executePing(target);
    });
  }, 3000);
}

startPingEngine();

// ==========================================
// Xiaomi Router Management Class
// ==========================================
class XiaomiManager {
  constructor(config = {}) {
    this.host = config.host || '192.168.31.1';
    this.password = config.password !== undefined ? config.password : '@nmhung1993';
    this.key = 'a2ffa5c9be07488bbb04a3a47d3c5f6a';
    this.deviceId = '1c:86:0b:3a:c7:d2';
    this.stok = null;
    this.meshManagers = new Map();
  }

  sha1(str) {
    return crypto.createHash('sha1').update(str).digest('hex');
  }

  formatDuration(seconds) {
    if (isNaN(seconds) || seconds <= 0) return '0 giây';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d} ngày`);
    if (h > 0 || d > 0) parts.push(`${h} giờ`);
    if (m > 0 || h > 0 || d > 0) parts.push(`${m} phút`);
    return parts.join(' ');
  }

  httpRequest(path, method = 'GET', data = null, headers = {}, timeout = 4000) {
    return new Promise((resolve, reject) => {
      const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      };
      if (data) {
        defaultHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        defaultHeaders['Content-Length'] = Buffer.byteLength(data);
      }

      const req = http.request({
        hostname: this.host,
        port: 80,
        path,
        method,
        headers: { ...defaultHeaders, ...headers },
        timeout
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      });

      req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout requesting ${path}`)); });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  async login() {
    try {
      const webPage = await this.httpRequest('/cgi-bin/luci/web', 'GET', null, {}, 3000).catch(() => null);
      if (webPage && webPage.body) {
        const keyMatch = webPage.body.match(/key:\s*['"]([^'"]+)['"]/);
        if (keyMatch) this.key = keyMatch[1];
        const devMatch = webPage.body.match(/deviceId\s*=\s*['"]([^'"]+)['"]/);
        if (devMatch) this.deviceId = devMatch[1];
      }

      const time = Math.floor(Date.now() / 1000);
      const random = Math.floor(Math.random() * 10000);
      const nonce = [0, this.deviceId, time, random].join('_');
      const oldPwd = this.sha1(nonce + this.sha1(this.password + this.key));

      const postData = querystring.stringify({
        username: 'admin',
        password: oldPwd,
        logtype: '2',
        nonce
      });

      const loginRes = await this.httpRequest('/cgi-bin/luci/api/xqsystem/login', 'POST', postData, {
        'Content-Type': 'application/x-www-form-urlencoded'
      }, 4000);

      const json = JSON.parse(loginRes.body || '{}');
      if (json.code === 0 && json.token) {
        this.stok = json.token;
        return this.stok;
      }
      throw new Error(`Login failed with code ${json.code}`);
    } catch (err) {
      this.stok = null;
      throw err;
    }
  }

  async api(endpoint, method = 'GET', data = null, retryOn401 = true) {
    if (!this.stok) await this.login();
    const fullPath = `/cgi-bin/luci/;stok=${this.stok}${endpoint}`;
    try {
      const res = await this.httpRequest(fullPath, method, data, {
        'Referer': `http://${this.host}/cgi-bin/luci/;stok=${this.stok}/web/home`
      }, 4000);

      const json = JSON.parse(res.body || '{}');
      if ((json.code === 401 || json.code === 1101) && retryOn401) {
        await this.login();
        return this.api(endpoint, method, data, false);
      }
      return json;
    } catch (err) {
      if (retryOn401) {
        await this.login();
        return this.api(endpoint, method, data, false);
      }
      throw err;
    }
  }

  getMeshManager(nodeIp) {
    if (!this.meshManagers.has(nodeIp)) {
      this.meshManagers.set(nodeIp, new XiaomiManager({ host: nodeIp, password: this.password }));
    }
    return this.meshManagers.get(nodeIp);
  }

  async fetchNodeStatus(nodeIp) {
    const mgr = this.getMeshManager(nodeIp);
    try {
      if (!mgr.stok) await mgr.login();
      const [initInfo, newStatus, wifiDevs] = await Promise.all([
        mgr.api('/api/xqsystem/init_info').catch(() => ({})),
        mgr.api('/api/misystem/newstatus').catch(() => ({})),
        mgr.api('/api/xqnetwork/wifi_connect_devices').catch(() => ({}))
      ]);
      const clients = Array.isArray(wifiDevs?.list) ? wifiDevs.list : [];
      return {
        online: true,
        cpu: newStatus?.cpu?.load ? Math.round(Number(newStatus.cpu.load) * 100) : 0,
        memory: newStatus?.mem?.usage ? Math.round(Number(newStatus.mem.usage) * 100) : 0,
        clientCount: clients.length,
        version: initInfo?.romversion || '6.2.33',
        hardware: initInfo?.hardware || 'CR8806'
      };
    } catch (e) {
      return { online: false, cpu: 0, memory: 0, clientCount: 0, error: e.message };
    }
  }

  async fetchStatus() {
    if (!this.stok) await this.login();
    const [initInfo, wanInfo, newStatus, wifiDetail, topoGraph, routerNameInfo, wifiDevs] = await Promise.all([
      this.api('/api/xqsystem/init_info').catch(() => ({})),
      this.api('/api/xqnetwork/wan_info').catch(() => ({})),
      this.api('/api/misystem/newstatus').catch(() => ({})),
      this.api('/api/xqnetwork/wifi_detail_all').catch(() => ({})),
      this.api('/api/misystem/topo_graph').catch(() => ({})),
      this.api('/api/misystem/router_name').catch(() => ({})),
      this.api('/api/xqnetwork/wifi_connect_devices').catch(() => ({}))
    ]);

    const uptimeSec = wanInfo?.info?.uptime || wanInfo?.uptime || 0;
    const rawLeafs = Array.isArray(topoGraph?.graph?.leafs)
      ? topoGraph.graph.leafs
      : Array.isArray(topoGraph?.leafs)
      ? topoGraph.leafs
      : [];

    const connectedWifiList = wifiDevs?.list || [];

    // Map each secondary mesh node
    const meshNodes = await Promise.all(rawLeafs.map(async (leaf, idx) => {
      const leafIp = leaf.ip || '';
      const nameClean = (leaf.name || '').replace(/[:-]/g, '').toLowerCase();
      const isWireless = connectedWifiList.some(d => {
        const cleanMac = (d.mac || '').replace(/[:-]/g, '').toLowerCase();
        return cleanMac.includes(nameClean) || nameClean.includes(cleanMac.slice(-4));
      });

      let nodeDetails = { online: true, cpu: 0, memory: 0, clientCount: 0 };
      if (leafIp) {
        nodeDetails = await this.fetchNodeStatus(leafIp);
      }

      return {
        id: `mesh_node_${idx + 2}`,
        name: leaf.name || `Xiaomi Mesh Node ${idx + 2}`,
        ip: leafIp,
        mac: leaf.mac || '',
        hardware: leaf.hardware || 'CR8806',
        version: nodeDetails.version || initInfo?.romversion || '6.2.33',
        backhaul: isWireless ? 'wifi' : 'wired',
        backhaulLabel: isWireless ? 'WiFi Mesh (Không dây)' : 'Cáp mạng LAN (Dây)',
        online: nodeDetails.online,
        cpu: nodeDetails.cpu,
        memory: nodeDetails.memory,
        clientCount: nodeDetails.clientCount
      };
    }));

    // Auto-update Targets list if mesh node IP changed (Automation)
    meshNodes.forEach(node => {
      if (!node.ip) return;
      // Match by name or target id
      const target = targets.find(t => 
        (node.name.includes('Node 2') && (t.name.includes('Node 2') || t.id === 't_mesh_119' || t.id === 't_mesh_120')) ||
        (node.name.includes('Node 3') && (t.name.includes('Node 3') || t.id === 't_mesh_196')) ||
        t.name.toLowerCase() === node.name.toLowerCase()
      );
      if (target && target.host !== node.ip) {
        console.log(`[Auto-Sync] Updating target "${target.name}" IP from ${target.host} to ${node.ip}`);
        target.host = node.ip;
        saveJson(TARGETS_FILE, targets);
      }
    });

    const rawClients = Array.isArray(wifiDevs?.list) ? wifiDevs.list : [];
    const clients = rawClients.map(c => ({
      name: c.name || c.hostname || c.devname || 'Thiết bị Wi-Fi',
      ip: c.ip || '',
      mac: c.mac || '',
      band: (c.band || '').includes('5g') || (c.frequency || '').includes('5') ? 'wifi50' : 'wifi24',
      signal: c.signal || 0
    }));

    const dnsList = wanInfo?.info?.dnsAddrs
      ? [wanInfo.info.dnsAddrs, wanInfo.info.dnsAddrs1].filter(Boolean)
      : (Array.isArray(wanInfo?.info?.details?.dns) ? wanInfo.info.details.dns : ['8.8.8.8', '8.8.4.4']);

    const wanIpStr = typeof wanInfo?.info?.ip === 'object'
      ? (wanInfo.info.ip.address || '')
      : (wanInfo?.info?.ip || wanInfo?.info?.details?.ip || '192.168.1.2');

    const gatewayStr = wanInfo?.info?.gateWay || wanInfo?.info?.gw || wanInfo?.info?.gateway || '192.168.1.1';

    return {
      host: this.host,
      online: true,
      routerName: routerNameInfo?.name || initInfo?.routername || 'Xiaomi Router CR8806 (Main)',
      hardware: initInfo?.hardware || 'CR8806',
      version: initInfo?.romversion || '6.2.33',
      uptime: uptimeSec,
      uptimeFormatted: this.formatDuration(uptimeSec),
      wan: {
        ip: wanIpStr,
        gateway: gatewayStr,
        dns: dnsList.join(', ') || '8.8.8.8, 8.8.4.4'
      },
      cpu: newStatus?.cpu?.load ? Math.round(Number(newStatus.cpu.load) * 100) : 12,
      memory: newStatus?.mem?.usage ? Math.round(Number(newStatus.mem.usage) * 100) : 48,
      wifi: {
        count: clients.length,
        wifi24Count: clients.filter(c => c.band === 'wifi24').length,
        wifi50Count: clients.filter(c => c.band === 'wifi50').length
      },
      clients,
      meshNodes
    };
  }

  async restartWifi(nodeIp) {
    const targetHost = nodeIp || this.host;
    const mgr = this.getMeshManager(targetHost);
    if (!mgr.stok) await mgr.login();
    const wifiDetail = await mgr.api('/api/xqnetwork/wifi_detail_all');
    const wifiList = wifiDetail?.info || [];
    const info24 = wifiList.find(i => i.ifname === 'wl1') || wifiList[0] || {};
    const info50 = wifiList.find(i => i.ifname === 'wl0') || wifiList[1] || {};

    const payload = {
      bsd: wifiDetail.bsd || 0,
      on1: info24.status || 1,
      ssid1: info24.ssid || 'MinhHung-Mesh',
      pwd1: info24.password || this.password,
      encryption1: info24.encryption || 'psk2',
      channel1: info24.channel || 11,
      on2: info50.status || 1,
      ssid2: info50.ssid || 'PingPong',
      pwd2: info50.password || this.password,
      encryption2: info50.encryption || 'psk2',
      channel2: info50.channel || 0
    };

    return mgr.api('/api/xqnetwork/set_all_wifi', 'POST', querystring.stringify(payload));
  }

  async reboot(nodeIp) {
    const targetHost = nodeIp || this.host;
    const mgr = this.getMeshManager(targetHost);
    if (!mgr.stok) await mgr.login();
    return mgr.api('/api/xqsystem/reboot', 'POST', 'client=web');
  }
}

// Router instance with default password @nmhung1993
let savedRouterConfig = loadJson(ROUTER_CONFIG_FILE, { host: '192.168.31.1', password: '@nmhung1993' });
let xiaomiInstance = new XiaomiManager(savedRouterConfig);

// Periodically run auto-discovery sync
setInterval(async () => {
  try {
    await xiaomiInstance.fetchStatus();
  } catch (e) {}
}, 30000);

// ==========================================
// Subnet IP Scanner with ARP and Reverse DNS
// ==========================================
function resolveArp(ip) {
  return new Promise((resolve) => {
    exec(`arp -a ${ip}`, { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const match = stdout.match(/([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/i);
      resolve(match ? match[1].toUpperCase() : null);
    });
  });
}

function resolveHostname(ip) {
  return new Promise((resolve) => {
    dns.reverse(ip, (err, hostnames) => {
      if (!err && hostnames && hostnames.length > 0) {
        return resolve(hostnames[0]);
      }
      resolve(null);
    });
  });
}

async function scanSubnet(subnetCidr = '192.168.31.0/24') {
  if (scanState.isScanning) return scanState;

  const baseMatch = subnetCidr.match(/^(\d+\.\d+\.\d+)\./);
  const baseIp = baseMatch ? baseMatch[1] : '192.168.31';
  
  scanState = {
    isScanning: true,
    current: 0,
    total: 254,
    abort: false,
    results: []
  };

  (async () => {
    const queue = [];
    for (let i = 1; i <= 254; i++) {
      queue.push(`${baseIp}.${i}`);
    }

    const concurrency = 25;
    const worker = async () => {
      while (queue.length > 0 && !scanState.abort) {
        const ip = queue.shift();
        scanState.current += 1;
        try {
          const res = await pingHost(ip, 700);
          if (res.alive) {
            const [mac, hostname] = await Promise.all([
              resolveArp(ip),
              resolveHostname(ip)
            ]);

            scanState.results.push({
              ip,
              mac: mac || 'N/A',
              hostname: hostname || (ip === '192.168.31.1' ? 'router.lan' : `Device-${ip.split('.').pop()}`),
              latency: res.latency,
              status: 'online',
              discoveredAt: new Date().toISOString()
            });
          }
        } catch (e) {}
      }
    };

    const workers = Array(concurrency).fill(null).map(() => worker());
    await Promise.all(workers);
    scanState.isScanning = false;

    // Save scan to history (keep last 20)
    const scanSession = {
      id: `scan_${Date.now()}`,
      scannedAt: new Date().toISOString(),
      subnet: subnetCidr,
      totalDiscovered: scanState.results.length,
      results: scanState.results
    };
    scanHistory.unshift(scanSession);
    if (scanHistory.length > 20) scanHistory = scanHistory.slice(0, 20);
    saveJson(SCAN_HISTORY_FILE, scanHistory);
  })();

  return scanState;
}

// ==========================================
// Express Router API
// ==========================================
const router = express.Router();

// GET all targets
router.get('/targets', (req, res) => {
  res.json(targets);
});

// POST new target
router.post('/targets', (req, res) => {
  const { name, host, tag, interval } = req.body;
  if (!host) return res.status(400).json({ error: 'host_required' });

  const intervalSec = Number(interval) || 3;
  const newTarget = {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name || host,
    host: host.trim(),
    tag: tag || 'Device',
    interval: intervalSec >= 1000 ? intervalSec : intervalSec * 1000,
    enabled: true,
    status: 'unknown',
    latency: null,
    packetLoss: 0,
    minLatency: null,
    maxLatency: null,
    avgLatency: null,
    history: [],
    totalPings: 0,
    failedPings: 0,
    lastCheck: null
  };

  targets.push(newTarget);
  saveJson(TARGETS_FILE, targets);
  executePing(newTarget);
  res.status(201).json(newTarget);
});

// PUT update target
router.put('/targets/:id', (req, res) => {
  const target = targets.find(t => t.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });

  const { name, host, tag, interval, enabled } = req.body;
  if (name !== undefined) target.name = name;
  if (host !== undefined) target.host = host.trim();
  if (tag !== undefined) target.tag = tag;
  if (interval !== undefined) {
    const val = Number(interval);
    target.interval = val >= 1000 ? val : (val > 0 ? val * 1000 : 3000);
  }
  if (enabled !== undefined) target.enabled = Boolean(enabled);

  saveJson(TARGETS_FILE, targets);
  res.json(target);
});

// DELETE target
router.delete('/targets/:id', (req, res) => {
  const index = targets.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'not_found' });

  const removed = targets.splice(index, 1)[0];
  saveJson(TARGETS_FILE, targets);
  res.json(removed);
});

// POST Instant ping single target
router.post('/targets/:id/ping', async (req, res) => {
  const target = targets.find(t => t.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });

  await executePing(target);
  res.json(target);
});

// GET / POST Subnet Scanner
router.get('/scan', (req, res) => {
  res.json(scanState);
});

router.post('/scan', async (req, res) => {
  const { subnet } = req.body;
  const state = await scanSubnet(subnet || '192.168.31.0/24');
  res.json(state);
});

router.delete('/scan', (req, res) => {
  scanState.abort = true;
  scanState.isScanning = false;
  res.json({ message: 'Scan stopped' });
});

// GET Scan History (20 most recent)
router.get('/scan/history', (req, res) => {
  res.json(scanHistory);
});

// GET Xiaomi Router status
router.get('/xiaomi/status', async (req, res) => {
  try {
    const status = await xiaomiInstance.fetchStatus();
    res.json(status);
  } catch (err) {
    res.status(502).json({ error: err.message, online: false });
  }
});

// POST Xiaomi Router config
router.post('/xiaomi/config', (req, res) => {
  const { host, password } = req.body;
  savedRouterConfig = { host: host || '192.168.31.1', password: password !== undefined ? password : '@nmhung1993' };
  saveJson(ROUTER_CONFIG_FILE, savedRouterConfig);
  xiaomiInstance = new XiaomiManager(savedRouterConfig);
  res.json({ message: 'Router config updated' });
});

// POST Restart WiFi on main router or specific node
router.post('/xiaomi/restart-wifi', async (req, res) => {
  const { nodeIp } = req.body || {};
  try {
    await xiaomiInstance.restartWifi(nodeIp);
    res.json({ success: true, message: `Đã gửi lệnh khởi động lại Wi-Fi (${nodeIp || 'Router chính'})` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Reboot main router or specific node
router.post('/xiaomi/reboot', async (req, res) => {
  const { nodeIp } = req.body || {};
  try {
    await xiaomiInstance.reboot(nodeIp);
    res.json({ success: true, message: `Đã gửi lệnh khởi động lại (${nodeIp || 'Router chính'})` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Summary metrics
router.get('/summary', (req, res) => {
  const total = targets.length;
  const online = targets.filter(t => t.enabled && t.status === 'online').length;
  const degraded = targets.filter(t => t.enabled && t.status === 'degraded').length;
  const offline = targets.filter(t => t.enabled && t.status === 'offline').length;
  const paused = targets.filter(t => !t.enabled).length;

  res.json({
    total,
    online,
    degraded,
    offline,
    paused
  });
});

module.exports = {
  networkRouter: router
};
