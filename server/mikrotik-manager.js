const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ==========================================
// MikroTik Binary API Protocol Helpers (Port 8728 / 8729)
// ==========================================
function encodeLength(len) {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) return Buffer.from([0x80 | (len >> 8), len & 0xff]);
  if (len < 0x200000) return Buffer.from([0xc0 | (len >> 16), (len >> 8) & 0xff, len & 0xff]);
  if (len < 0x10000000) return Buffer.from([0xe0 | (len >> 24), (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  return Buffer.from([0xf0, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
}

function encodeSentence(words) {
  const chunks = [];
  for (const word of words) {
    const b = Buffer.from(String(word), 'utf8');
    chunks.push(encodeLength(b.length));
    chunks.push(b);
  }
  chunks.push(Buffer.from([0])); // End of sentence (length 0)
  return Buffer.concat(chunks);
}

class RouterOSSocketClient {
  constructor(options = {}) {
    this.host = options.host || '192.168.1.1';
    this.port = Number(options.port) || (options.useSsl ? 8729 : 8728);
    this.username = options.username || 'admin';
    this.password = options.password !== undefined ? options.password : '';
    this.useSsl = Boolean(options.useSsl || this.port === 8729);
    this.timeout = options.timeout || 3000;
  }

  async connectAndQuery(commands = []) {
    return new Promise((resolve, reject) => {
      let socket = null;
      let buffer = Buffer.alloc(0);
      let isDone = false;

      const finish = (err, data) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timer);
        if (socket) {
          try { socket.destroy(); } catch {}
        }
        if (err) reject(err);
        else resolve(data);
      };

      const timer = setTimeout(() => {
        finish(new Error(`Timeout (${this.timeout}ms) connecting to MikroTik API ${this.host}:${this.port}`));
      }, this.timeout);

      try {
        if (this.useSsl) {
          socket = tls.connect({
            host: this.host,
            port: this.port,
            rejectUnauthorized: false
          });
        } else {
          socket = net.createConnection({
            host: this.host,
            port: this.port
          });
        }
      } catch (e) {
        return finish(e);
      }

      socket.on('error', (err) => finish(err));

      const parsedSentences = [];
      let pendingWords = [];

      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length > 0) {
          let len = 0;
          let lenBytes = 0;
          const first = buffer[0];

          if (first < 0x80) {
            len = first;
            lenBytes = 1;
          } else if ((first & 0xc0) === 0x80) {
            if (buffer.length < 2) break;
            len = ((first & ~0x80) << 8) | buffer[1];
            lenBytes = 2;
          } else if ((first & 0xe0) === 0xc0) {
            if (buffer.length < 3) break;
            len = ((first & ~0xc0) << 16) | (buffer[1] << 8) | buffer[2];
            lenBytes = 3;
          } else if ((first & 0xf0) === 0xe0) {
            if (buffer.length < 4) break;
            len = ((first & ~0xe0) << 24) | (buffer[1] << 16) | (buffer[2] << 8) | buffer[3];
            lenBytes = 4;
          } else if (first === 0xf0) {
            if (buffer.length < 5) break;
            len = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];
            lenBytes = 5;
          }

          if (buffer.length < lenBytes + len) {
            break;
          }

          if (len === 0) {
            parsedSentences.push([...pendingWords]);
            pendingWords = [];
            buffer = buffer.slice(lenBytes);
          } else {
            const wordBuffer = buffer.slice(lenBytes, lenBytes + len);
            pendingWords.push(wordBuffer.toString('utf8'));
            buffer = buffer.slice(lenBytes + len);
          }
        }

        processConversation();
      });

      let state = 'INIT';
      let currentCmdIdx = 0;
      const cmdResults = [];
      let currentReList = [];
      let currentCmdError = null;

      const processConversation = () => {
        while (parsedSentences.length > 0) {
          const sentence = parsedSentences.shift();
          const type = sentence[0];

          if (type === '!fatal') {
            return finish(new Error(`MikroTik fatal error: ${sentence.slice(1).join(' ')}`));
          }

          if (state === 'INIT' || state === 'LOGIN_SENT') {
            if (type === '!done') {
              const retWord = sentence.find(w => w.startsWith('=ret='));
              if (retWord && state === 'INIT') {
                const challengeHex = retWord.slice(5);
                const challenge = Buffer.from(challengeHex, 'hex');
                const md5 = crypto.createHash('md5');
                md5.update(Buffer.from([0]));
                md5.update(Buffer.from(this.password, 'utf8'));
                md5.update(challenge);
                const responseHex = '00' + md5.digest('hex');

                socket.write(encodeSentence([
                  '/login',
                  `=name=${this.username}`,
                  `=response=${responseHex}`
                ]));
                state = 'LOGIN_SENT';
                continue;
              }

              state = 'EXECUTING';
              executeNextCommand();
              continue;
            } else if (type === '!trap') {
              const msg = sentence.find(w => w.startsWith('=message='))?.slice(9) || 'Login failed';
              return finish(new Error(`MikroTik Login Trap: ${msg}`));
            }
          }

          if (state === 'EXECUTING') {
            if (type === '!re') {
              const item = {};
              sentence.slice(1).forEach(w => {
                if (w.startsWith('=')) {
                  const eqIdx = w.indexOf('=', 1);
                  if (eqIdx !== -1) {
                    item[w.slice(1, eqIdx)] = w.slice(eqIdx + 1);
                  } else {
                    item[w.slice(1)] = '';
                  }
                }
              });
              currentReList.push(item);
            } else if (type === '!trap') {
              // Record error, but wait for !done before advancing command!
              const msg = sentence.find(w => w.startsWith('=message='))?.slice(9) || 'Command failed';
              currentCmdError = msg;
            } else if (type === '!done') {
              if (currentCmdError) {
                cmdResults.push([]);
                currentCmdError = null;
              } else {
                cmdResults.push(currentReList);
              }
              currentReList = [];
              currentCmdIdx++;
              if (currentCmdIdx < commands.length) {
                executeNextCommand();
              } else {
                finish(null, cmdResults);
              }
            }
          }
        }
      };

      const executeNextCommand = () => {
        const cmd = commands[currentCmdIdx];
        const words = Array.isArray(cmd) ? cmd : [cmd];
        socket.write(encodeSentence(words));
      };

      socket.on('connect', () => {
        socket.write(encodeSentence([
          '/login',
          `=name=${this.username}`,
          `=password=${this.password}`
        ]));
      });
    });
  }
}

// ==========================================
// Unified MikroTik Manager (Socket API 8728/8729 & REST API 80/8080/443/8443)
// ==========================================
class MikroTikManager {
  constructor(config = {}) {
    this.host = config.host || '192.168.1.1';
    this.port = Number(config.port) || (config.useHttps ? 8729 : 8728);
    this.username = config.username || 'admin';
    this.password = config.password !== undefined ? config.password : '';
    this.useHttps = Boolean(config.useHttps || this.port === 8729 || this.port === 8443 || this.port === 443);
    this.pppoeInterface = config.pppoeInterface || 'pppoe-out1';

    this.prevTraffic = null;
    this.lastTrafficCheck = 0;
    this.cachedDeviceMap = null;
    this.lastDeviceMapFetch = 0;
  }

  isSocketPort() {
    return this.port === 8728 || this.port === 8729 || (![80, 8080, 443, 8443].includes(this.port) && this.port >= 8000);
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
    return parts.join(' ') || `${seconds}s`;
  }

  parseMikroTikUptime(uptimeStr) {
    if (!uptimeStr) return 0;
    let totalSeconds = 0;
    const weeksMatch = uptimeStr.match(/(\d+)w/i);
    const daysMatch = uptimeStr.match(/(\d+)d/i);
    const hoursMatch = uptimeStr.match(/(\d+)h/i);
    const minsMatch = uptimeStr.match(/(\d+)m/i);
    const secsMatch = uptimeStr.match(/(\d+)s/i);

    if (weeksMatch) totalSeconds += parseInt(weeksMatch[1], 10) * 7 * 86400;
    if (daysMatch) totalSeconds += parseInt(daysMatch[1], 10) * 86400;
    if (hoursMatch) totalSeconds += parseInt(hoursMatch[1], 10) * 3600;
    if (minsMatch) totalSeconds += parseInt(minsMatch[1], 10) * 60;
    if (secsMatch) totalSeconds += parseInt(secsMatch[1], 10);

    if (totalSeconds > 0) return totalSeconds;

    if (uptimeStr.includes(':')) {
      let rest = uptimeStr;
      if (rest.includes('d')) {
        const parts = rest.split('d');
        totalSeconds += parseInt(parts[0], 10) * 86400;
        rest = parts[1];
      }
      const timeParts = rest.split(':').map(Number);
      if (timeParts.length === 3) {
        totalSeconds += (timeParts[0] * 3600) + (timeParts[1] * 60) + timeParts[2];
      } else if (timeParts.length === 2) {
        totalSeconds += (timeParts[0] * 60) + timeParts[1];
      }
    }

    return totalSeconds || 0;
  }

  async pingHost(host = this.host, timeoutMs = 1000) {
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
      }, timeoutMs + 200);
    });
  }

  // REST API fallback for web ports
  httpRestRequest(apiPath, method = 'GET', postData = null, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      let isDone = false;
      const done = (err, res) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(res);
      };

      const timer = setTimeout(() => {
        if (!isDone) {
          try { req.destroy(); } catch {}
          done(new Error(`MikroTik REST API timeout (${timeoutMs}ms) for ${apiPath}`));
        }
      }, timeoutMs);

      const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      const headers = {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'User-Agent': 'MinhHungOps-MikroTik-Client'
      };

      let bodyData = null;
      if (postData) {
        bodyData = typeof postData === 'string' ? postData : JSON.stringify(postData);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyData);
      }

      const client = this.useHttps ? https : http;
      const req = client.request({
        hostname: this.host,
        port: this.port,
        path: apiPath.startsWith('/rest') ? apiPath : `/rest${apiPath.startsWith('/') ? '' : '/'}${apiPath}`,
        method,
        headers,
        rejectUnauthorized: false
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = body ? JSON.parse(body) : {};
              done(null, parsed);
            } catch (e) {
              done(null, body);
            }
          } else {
            done(new Error(`MikroTik REST API error (${res.statusCode}): ${body || res.statusMessage}`));
          }
        });
        res.on('error', err => done(err));
      });

      req.on('error', err => done(err));
      if (bodyData) req.write(bodyData);
      req.end();
    });
  }

  async fetchStatus() {
    const now = Date.now();
    if (this.lastStatusCache && (now - this.lastStatusTime < 1500)) {
      return this.lastStatusCache;
    }

    // 1. Try Native Socket API (Port 8728 / 8729) if socket port
    if (this.isSocketPort()) {
      try {
        const client = new RouterOSSocketClient({
          host: this.host,
          port: this.port,
          username: this.username,
          password: this.password,
          useSsl: this.useHttps
        });

        const [
          resourceData,
          pppoeData,
          addressData,
          dnsData,
          leaseData,
          interfaceData
        ] = await client.connectAndQuery([
          '/system/resource/print',
          '/interface/pppoe-client/print',
          '/ip/address/print',
          '/ip/dns/print',
          '/ip/dhcp-server/lease/print',
          '/interface/print'
        ]);

        const resource = Array.isArray(resourceData) && resourceData[0] ? resourceData[0] : {};

        const cpuLoad = Number(resource['cpu-load'] || resource.cpu_load || 0);
        const totalMem = Number(resource['total-memory'] || 0);
        const freeMem = Number(resource['free-memory'] || 0);
        const memUsagePct = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;
        
        const totalHdd = Number(resource['total-hdd-space'] || 0);
        const freeHdd = Number(resource['free-hdd-space'] || 0);
        const hddUsagePct = totalHdd > 0 ? Math.round(((totalHdd - freeHdd) / totalHdd) * 100) : 0;

        const uptimeRaw = resource.uptime || '';
        const uptimeSec = this.parseMikroTikUptime(uptimeRaw);
        const boardName = resource['board-name'] || resource.platform || 'MikroTik RouterOS';
        const version = resource.version || 'RouterOS v7';

        // PPPoE Client Info
        const pppoeList = Array.isArray(pppoeData) ? pppoeData : [];
        const pppoeClient = pppoeList.find(p => p.name === this.pppoeInterface || p['default-name'] === this.pppoeInterface) || pppoeList[0] || {};
        const isPppoeRunning = pppoeClient.running === 'true' || pppoeClient.running === true || pppoeClient.disabled === 'false';
        const pppoeUser = pppoeClient.user || '--';
        const pppoeInterfaceName = pppoeClient.name || this.pppoeInterface;

        // WAN IP and Gateway from addresses
        const addresses = Array.isArray(addressData) ? addressData : [];
        let wanIpObj = addresses.find(a => a.interface === pppoeInterfaceName);
        if (!wanIpObj) {
          wanIpObj = addresses.find(a => a.address && !a.address.startsWith('192.168.') && !a.address.startsWith('10.') && !a.address.startsWith('172.16.') && !a.address.startsWith('127.'));
        }
        const wanIp = wanIpObj ? wanIpObj.address.split('/')[0] : (isPppoeRunning ? 'Connected (Dynamic WAN)' : '--');
        const wanGateway = wanIpObj?.network || 'PPPoE Server (ISP Gateway)';

        // DNS Servers
        const dnsObj = Array.isArray(dnsData) && dnsData[0] ? dnsData[0] : {};
        const dnsServers = dnsObj['dynamic-servers'] || dnsObj.servers || '8.8.8.8, 1.1.1.1';

        // DHCP Leases
        const rawLeases = Array.isArray(leaseData) ? leaseData : [];
        const leases = rawLeases.map(l => {
          return {
            id: l['.id'] || l.id,
            ip: l.address || l['active-address'] || '--',
            mac: (l['mac-address'] || l['active-mac-address'] || '').toUpperCase(),
            hostname: l['host-name'] || l['active-host-name'] || l.comment || 'Thiết bị LAN',
            comment: l.comment || '',
            status: l.status || (l.disabled === 'true' ? 'disabled' : 'bound'),
            expiresAfter: l['expires-after'] || '--',
            dynamic: l.dynamic === 'true' || l.dynamic === true,
            server: l.server || 'defconf'
          };
        }).sort((a, b) => {
          const lastA = Number((a.ip || '').split('.').pop()) || 0;
          const lastB = Number((b.ip || '').split('.').pop()) || 0;
          return lastA - lastB;
        });

        // Realtime Bandwidth Tx/Rx on PPPoE interface
        const ifList = Array.isArray(interfaceData) ? interfaceData : [];
        const pppoeIf = ifList.find(i => i.name === pppoeInterfaceName) || ifList[0] || {};
        const curRxBytes = Number(pppoeIf['rx-byte'] || pppoeIf['rx-bytes'] || 0);
        const curTxBytes = Number(pppoeIf['tx-byte'] || pppoeIf['tx-bytes'] || 0);
        const now = Date.now();
        
        let rxMbps = 0;
        let txMbps = 0;

        if (this.prevTraffic && this.lastTrafficCheck > 0) {
          const timeDiffSec = (now - this.lastTrafficCheck) / 1000;
          if (timeDiffSec > 0.5) {
            const rxDiff = Math.max(0, curRxBytes - this.prevTraffic.rxBytes);
            const txDiff = Math.max(0, curTxBytes - this.prevTraffic.txBytes);
            rxMbps = parseFloat(((rxDiff * 8) / (timeDiffSec * 1000000)).toFixed(2));
            txMbps = parseFloat(((txDiff * 8) / (timeDiffSec * 1000000)).toFixed(2));
          }
        }

        this.prevTraffic = { rxBytes: curRxBytes, txBytes: curTxBytes };
        this.lastTrafficCheck = now;

        const result = {
          host: this.host,
          port: this.port,
          online: true,
          routerName: `${boardName} (Core Gateway)`,
          hardware: boardName,
          model: boardName,
          serialNumber: '',
          version,
          uptime: uptimeSec,
          uptimeFormatted: this.formatDuration(uptimeSec),
          cpu: cpuLoad,
          cpuCount: Number(resource['cpu-count'] || 1),
          memory: memUsagePct,
          memoryTotalMb: Math.round(totalMem / (1024 * 1024)),
          memoryFreeMb: Math.round(freeMem / (1024 * 1024)),
          hddUsagePct,
          wan: {
            ip: wanIp,
            gateway: wanGateway,
            dns: typeof dnsServers === 'string' ? dnsServers : '8.8.8.8, 1.1.1.1',
            pppoeStatus: isPppoeRunning ? 'online' : 'disconnected',
            pppoeUser,
            interface: pppoeInterfaceName
          },
          bandwidth: { rxMbps, txMbps, rxBytes: curRxBytes, txBytes: curTxBytes },
          dhcpLeases: leases,
          clientsCount: leases.length,
          isApiConnected: true,
          connectionType: 'RouterOS Socket API (Port ' + this.port + ')',
          authError: null
        };
        this.lastStatusCache = result;
        this.lastStatusTime = Date.now();
        return result;
      } catch (err) {
        console.error('MikroTik Socket API error:', err.message);
      }
    }

    // 2. Fallback to REST API (Port 80/8080/443/8443)
    try {
      const [
        resourceRes,
        pppoeRes,
        ipAddressRes,
        dnsRes,
        dhcpLeasesRes,
        interfaceRes
      ] = await Promise.all([
        this.httpRestRequest('/system/resource').catch(err => ({ _error: err.message })),
        this.httpRestRequest('/interface/pppoe-client').catch(() => ([])),
        this.httpRestRequest('/ip/address').catch(() => ([])),
        this.httpRestRequest('/ip/dns').catch(() => ({})),
        this.httpRestRequest('/ip/dhcp-server/lease').catch(() => ([])),
        this.httpRestRequest('/interface').catch(() => ([]))
      ]);

      const isApiSuccess = !resourceRes._error;
      const resource = Array.isArray(resourceRes) ? resourceRes[0] : resourceRes;

      const cpuLoad = Number(resource?.['cpu-load'] ?? resource?.cpu_load ?? 0);
      const totalMem = Number(resource?.['total-memory'] ?? 0);
      const freeMem = Number(resource?.['free-memory'] ?? 0);
      const memUsagePct = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;
      
      const totalHdd = Number(resource?.['total-hdd-space'] ?? 0);
      const freeHdd = Number(resource?.['free-hdd-space'] ?? 0);
      const hddUsagePct = totalHdd > 0 ? Math.round(((totalHdd - freeHdd) / totalHdd) * 100) : 0;

      const uptimeRaw = resource?.uptime || '';
      const uptimeSec = this.parseMikroTikUptime(uptimeRaw);
      const boardName = resource?.['board-name'] || resource?.platform || 'MikroTik RouterOS';
      const version = resource?.version || 'RouterOS v7';

      const pppoeList = Array.isArray(pppoeRes) ? pppoeRes : (pppoeRes ? [pppoeRes] : []);
      const pppoeClient = pppoeList.find(p => p.name === this.pppoeInterface || p['default-name'] === this.pppoeInterface) || pppoeList[0] || {};
      const isPppoeRunning = pppoeClient.running === 'true' || pppoeClient.running === true || pppoeClient.disabled === 'false';
      const pppoeUser = pppoeClient.user || '--';
      const pppoeInterfaceName = pppoeClient.name || this.pppoeInterface;

      const addresses = Array.isArray(ipAddressRes) ? ipAddressRes : [];
      let wanIpObj = addresses.find(a => a.interface === pppoeInterfaceName);
      if (!wanIpObj) {
        wanIpObj = addresses.find(a => !a.address.startsWith('192.168.') && !a.address.startsWith('10.') && !a.address.startsWith('172.16.') && !a.address.startsWith('127.'));
      }
      const wanIp = wanIpObj ? wanIpObj.address.split('/')[0] : (isPppoeRunning ? 'Connected (Dynamic WAN)' : '--');
      const wanGateway = wanIpObj?.network || 'PPPoE Server (ISP Gateway)';

      const dnsServers = dnsRes?.['dynamic-servers'] || dnsRes?.servers || '8.8.8.8, 1.1.1.1';

      const rawLeases = Array.isArray(dhcpLeasesRes) ? dhcpLeasesRes : [];
      const leases = rawLeases.map(l => {
        return {
          id: l['.id'] || l.id,
          ip: l.address || l['active-address'] || '--',
          mac: (l['mac-address'] || l['active-mac-address'] || '').toUpperCase(),
          hostname: l['host-name'] || l['active-host-name'] || l.comment || 'Thiết bị LAN',
          comment: l.comment || '',
          status: l.status || (l.disabled === 'true' ? 'disabled' : 'bound'),
          expiresAfter: l['expires-after'] || '--',
          dynamic: l.dynamic === 'true' || l.dynamic === true,
          server: l.server || 'defconf'
        };
      }).sort((a, b) => {
        const lastA = Number((a.ip || '').split('.').pop()) || 0;
        const lastB = Number((b.ip || '').split('.').pop()) || 0;
        return lastA - lastB;
      });

      const restResult = {
        host: this.host,
        port: this.port,
        online: true,
        routerName: `${boardName} (Core Gateway)`,
        hardware: boardName,
        model: boardName,
        serialNumber: '',
        version,
        uptime: uptimeSec,
        uptimeFormatted: this.formatDuration(uptimeSec),
        cpu: cpuLoad,
        cpuCount: Number(resource?.['cpu-count'] || 1),
        memory: memUsagePct,
        memoryTotalMb: Math.round(totalMem / (1024 * 1024)),
        memoryFreeMb: Math.round(freeMem / (1024 * 1024)),
        hddUsagePct,
        wan: {
          ip: wanIp,
          gateway: wanGateway,
          dns: typeof dnsServers === 'string' ? dnsServers : (Array.isArray(dnsServers) ? dnsServers.join(', ') : '8.8.8.8, 1.1.1.1'),
          pppoeStatus: isPppoeRunning ? 'online' : (isApiSuccess ? 'disconnected' : 'unknown'),
          pppoeUser,
          interface: pppoeInterfaceName
        },
        bandwidth: { rxMbps: 0, txMbps: 0, rxBytes: 0, txBytes: 0 },
        dhcpLeases: leases,
        clientsCount: leases.length,
        isApiConnected: isApiSuccess,
        connectionType: 'RouterOS REST API (Port ' + this.port + ')',
        authError: isApiSuccess ? null : resourceRes._error
      };
      this.lastStatusCache = restResult;
      this.lastStatusTime = Date.now();
      return restResult;

    } catch (err) {
      const offlineResult = {
        host: this.host,
        port: this.port,
        online: false,
        routerName: 'MikroTik RouterOS (Gateway)',
        hardware: 'MikroTik RouterBOARD',
        version: 'RouterOS',
        uptime: 0,
        uptimeFormatted: 'Không thể kết nối API Port ' + this.port,
        wan: { ip: '--', gateway: '--', dns: '8.8.8.8, 1.1.1.1', pppoeStatus: 'offline' },
        cpu: 0,
        memory: 0,
        bandwidth: { rxMbps: 0, txMbps: 0, rxBytes: 0, txBytes: 0 },
        dhcpLeases: [],
        clientsCount: 0,
        isApiConnected: false,
        authError: err.message
      };
      return offlineResult;
    }
  }

  async getAuthoritativeDeviceMap() {
    const now = Date.now();
    if (this.cachedDeviceMap && (now - this.lastDeviceMapFetch < 15000)) {
      return this.cachedDeviceMap;
    }

    try {
      let leases = [];
      if (this.isSocketPort()) {
        const client = new RouterOSSocketClient({
          host: this.host,
          port: this.port,
          username: this.username,
          password: this.password,
          useSsl: this.useHttps
        });
        const res = await client.connectAndQuery(['/ip/dhcp-server/lease/print']);
        leases = Array.isArray(res[0]) ? res[0] : [];
      } else {
        leases = await this.httpRestRequest('/ip/dhcp-server/lease', 'GET', null, 2500);
      }

      if (Array.isArray(leases) && leases.length > 0) {
        const map = new Map();
        leases.forEach(l => {
          const ip = l.address || l['active-address'];
          const mac = (l['mac-address'] || l['active-mac-address'] || '').toUpperCase().replace(/-/g, ':');
          const name = l['host-name'] || l['active-host-name'] || l.comment || '';
          if (ip && ip !== '--') {
            map.set(ip, { name, mac });
          }
        });
        if (map.size > 0) {
          this.cachedDeviceMap = map;
          this.lastDeviceMapFetch = now;
          return map;
        }
      }
    } catch (e) {}
    return this.cachedDeviceMap || new Map();
  }

  async reconnectPppoe(interfaceName = this.pppoeInterface) {
    if (this.isSocketPort()) {
      const client = new RouterOSSocketClient({
        host: this.host,
        port: this.port,
        username: this.username,
        password: this.password,
        useSsl: this.useHttps
      });

      const pppoeRes = await client.connectAndQuery(['/interface/pppoe-client/print']);
      const list = Array.isArray(pppoeRes[0]) ? pppoeRes[0] : [];
      const target = list.find(p => p.name === interfaceName || p['default-name'] === interfaceName) || list[0];
      const targetId = target ? (target['.id'] || target.id) : interfaceName;

      await client.connectAndQuery([
        ['/interface/pppoe-client/disable', `*numbers=${targetId}`]
      ]);
      await new Promise(r => setTimeout(r, 1500));
      await client.connectAndQuery([
        ['/interface/pppoe-client/enable', `*numbers=${targetId}`]
      ]);

      return { success: true, message: `Đã kích hoạt làm mới phiên PPPoE (${interfaceName}) thành công qua API Socket!` };
    } else {
      const pppoeList = await this.httpRestRequest('/interface/pppoe-client');
      const target = (Array.isArray(pppoeList) ? pppoeList : []).find(p => p.name === interfaceName || p['default-name'] === interfaceName) || pppoeList[0];
      const targetId = target ? (target['.id'] || target.id) : interfaceName;

      await this.httpRestRequest(`/interface/pppoe-client/${targetId}`, 'PATCH', { disabled: 'true' });
      await new Promise(r => setTimeout(r, 1500));
      await this.httpRestRequest(`/interface/pppoe-client/${targetId}`, 'PATCH', { disabled: 'false' });

      return { success: true, message: `Đã kích hoạt làm mới phiên PPPoE (${interfaceName}) thành công qua REST API!` };
    }
  }

  async reboot() {
    if (this.isSocketPort()) {
      const client = new RouterOSSocketClient({
        host: this.host,
        port: this.port,
        username: this.username,
        password: this.password,
        useSsl: this.useHttps
      });
      await client.connectAndQuery(['/system/reboot']);
      return { success: true, message: 'Đã gửi lệnh khởi động lại MikroTik RouterOS' };
    } else {
      await this.httpRestRequest('/system/reboot', 'POST', {});
      return { success: true, message: 'Đã gửi lệnh khởi động lại MikroTik RouterOS' };
    }
  }
}

module.exports = {
  MikroTikManager,
  RouterOSSocketClient
};
