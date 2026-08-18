/**
 * Docker Engine Manager for MinhHungOps
 * Supports Local Docker (Unix socket, Windows Named Pipe, TCP) and LAN Multi-Host Agents.
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class DockerManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.localAvailable = null;
    this.lastCheckTime = 0;
    this.remoteHosts = new Map(); // hostId -> { agentId, name, ip, lastSeen }
  }

  getSocketConfig() {
    if (process.env.DOCKER_HOST) {
      const dockerHost = process.env.DOCKER_HOST.trim();
      if (dockerHost.startsWith('unix://')) {
        return { socketPath: dockerHost.replace('unix://', '') };
      }
      if (dockerHost.startsWith('npipe://')) {
        return { socketPath: dockerHost.replace('npipe://', '') };
      }
      if (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://')) {
        const url = new URL(dockerHost.replace('tcp://', 'http://'));
        return { host: url.hostname, port: Number(url.port) || 2375 };
      }
    }

    if (process.platform === 'win32') {
      return { socketPath: '\\\\.\\pipe\\docker_engine' };
    }

    // On Linux / Docker container
    if (fs.existsSync('/var/run/docker.sock')) {
      return { socketPath: '/var/run/docker.sock' };
    }

    // Default fallback to local socket proxy or default socket
    return { socketPath: '/var/run/docker.sock' };
  }

  async isAvailable() {
    const now = Date.now();
    if (this.localAvailable !== null && now - this.lastCheckTime < 10000) {
      return this.localAvailable;
    }
    try {
      const ping = await this.ping();
      this.localAvailable = ping;
    } catch {
      this.localAvailable = false;
    }
    this.lastCheckTime = now;
    return this.localAvailable;
  }

  ping() {
    return new Promise((resolve) => {
      const config = this.getSocketConfig();
      const req = http.request({
        ...config,
        path: '/_ping',
        method: 'GET',
        timeout: 2000
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(res.statusCode === 200 && data.trim() === 'OK'));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  request(pathUrl, method = 'GET', body = null, options = {}) {
    return new Promise((resolve, reject) => {
      const config = this.getSocketConfig();
      const headers = { ...options.headers };
      let payload = null;

      if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      } else if (body) {
        payload = body;
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = http.request({
        ...config,
        path: pathUrl,
        method,
        headers,
        timeout: options.timeout || 30000
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || '';
          let result = buffer;
          if (contentType.includes('application/json') || options.json) {
            try {
              result = JSON.parse(buffer.toString('utf8'));
            } catch {
              result = buffer.toString('utf8');
            }
          } else if (options.text) {
            result = buffer.toString('utf8');
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            const err = new Error(typeof result === 'object' && result?.message ? result.message : `Docker API error: HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.body = result;
            reject(err);
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Docker API request timeout'));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  // Raw socket connection for Docker logs / exec streaming
  getRawSocket(pathUrl, method = 'POST', headers = {}) {
    return new Promise((resolve, reject) => {
      const config = this.getSocketConfig();
      let socket;

      if (config.socketPath) {
        socket = net.connect(config.socketPath);
      } else {
        socket = net.connect(config.port || 2375, config.host || '127.0.0.1');
      }

      socket.once('connect', () => {
        const headerLines = [
          `${method} ${pathUrl} HTTP/1.1`,
          `Host: ${config.host || 'localhost'}`,
          'Connection: Upgrade',
          'Upgrade: tcp',
          ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
          '\r\n'
        ].join('\r\n');

        socket.write(headerLines);

        let responseHeader = '';
        const onData = (chunk) => {
          responseHeader += chunk.toString('binary');
          const headerEnd = responseHeader.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            socket.removeListener('data', onData);
            const remaining = Buffer.from(responseHeader.slice(headerEnd + 4), 'binary');
            if (remaining.length > 0) {
              socket.unshift(remaining);
            }
            resolve(socket);
          }
        };

        socket.on('data', onData);
      });

      socket.on('error', (err) => reject(err));
      socket.setTimeout(10000, () => {
        socket.destroy();
        reject(new Error('Socket connection timeout'));
      });
    });
  }

  // ==========================================
  // Docker Host & Summary Info
  // ==========================================
  async getSystemInfo() {
    const isAvail = await this.isAvailable();
    if (!isAvail) {
      return { available: false, error: 'Docker daemon not reachable on this host' };
    }

    try {
      const [info, version] = await Promise.all([
        this.request('/info', 'GET', null, { json: true }).catch(() => ({})),
        this.request('/version', 'GET', null, { json: true }).catch(() => ({}))
      ]);

      return {
        available: true,
        serverVersion: version.Version || 'Unknown',
        apiVersion: version.ApiVersion || '1.45',
        os: info.OperatingSystem || version.Os || process.platform,
        architecture: info.Architecture || version.Arch || process.arch,
        cpus: info.NCPU || 0,
        totalMemoryBytes: info.MemTotal || 0,
        containersTotal: info.Containers || 0,
        containersRunning: info.ContainersRunning || 0,
        containersPaused: info.ContainersPaused || 0,
        containersStopped: info.ContainersStopped || 0,
        imagesCount: info.Images || 0,
        driver: info.Driver || 'overlay2',
        dockerRootDir: info.DockerRootDir || ''
      };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  // ==========================================
  // Containers Operations
  // ==========================================
  async listContainers({ all = true } = {}) {
    const isAvail = await this.isAvailable();
    if (!isAvail) return [];

    try {
      const raw = await this.request(`/containers/json?all=${all ? 1 : 0}`, 'GET', null, { json: true });
      if (!Array.isArray(raw)) return [];

      return raw.map((c) => {
        const name = (c.Names && c.Names[0] ? c.Names[0].replace(/^\//, '') : c.Id.slice(0, 12));
        const composeProject = c.Labels?.['com.docker.compose.project'] || null;
        const composeService = c.Labels?.['com.docker.compose.service'] || null;

        const ports = (c.Ports || []).map((p) => ({
          ip: p.IP || '',
          privatePort: p.PrivatePort,
          publicPort: p.PublicPort,
          type: p.Type
        }));

        return {
          id: c.Id,
          shortId: c.Id.slice(0, 12),
          name,
          image: c.Image,
          imageId: c.ImageID,
          command: c.Command,
          created: c.Created,
          state: c.State, // running, exited, paused, restarting, dead
          status: c.Status,
          ports,
          labels: c.Labels || {},
          composeProject,
          composeService,
          sizeRw: c.SizeRw || 0,
          sizeRootFs: c.SizeRootFs || 0
        };
      });
    } catch (err) {
      console.error('Failed to list containers:', err.message);
      return [];
    }
  }

  async getContainerDetails(containerId) {
    const isAvail = await this.isAvailable();
    if (!isAvail) throw new Error('Docker is not available');

    const data = await this.request(`/containers/${encodeURIComponent(containerId)}/json`, 'GET', null, { json: true });
    return {
      id: data.Id,
      shortId: data.Id.slice(0, 12),
      name: data.Name ? data.Name.replace(/^\//, '') : '',
      created: data.Created,
      path: data.Path,
      args: data.Args || [],
      state: {
        status: data.State?.Status,
        running: data.State?.Running,
        paused: data.State?.Paused,
        restarting: data.State?.Restarting,
        oomKilled: data.State?.OOMKilled,
        dead: data.State?.Dead,
        pid: data.State?.Pid,
        exitCode: data.State?.ExitCode,
        error: data.State?.Error,
        startedAt: data.State?.StartedAt,
        finishedAt: data.State?.FinishedAt,
        health: data.State?.Health ? {
          status: data.State.Health.Status,
          failingStreak: data.State.Health.FailingStreak,
          log: data.State.Health.Log?.slice(-5) || []
        } : null
      },
      image: data.Config?.Image,
      imageId: data.Image,
      env: (data.Config?.Env || []).map((e) => {
        const [k, ...v] = e.split('=');
        return { key: k, value: v.join('=') };
      }),
      cmd: data.Config?.Cmd || [],
      entrypoint: data.Config?.Entrypoint || [],
      workingDir: data.Config?.WorkingDir || '',
      labels: data.Config?.Labels || {},
      mounts: (data.Mounts || []).map((m) => ({
        type: m.Type,
        name: m.Name,
        source: m.Source,
        destination: m.Destination,
        mode: m.Mode,
        rw: m.RW
      })),
      networkSettings: {
        ipAddress: data.NetworkSettings?.IPAddress || '',
        gateway: data.NetworkSettings?.Gateway || '',
        macAddress: data.NetworkSettings?.MacAddress || '',
        ports: data.NetworkSettings?.Ports || {},
        networks: Object.keys(data.NetworkSettings?.Networks || {})
      },
      restartPolicy: data.HostConfig?.RestartPolicy?.Name || 'no'
    };
  }

  async getContainerStats(containerId) {
    const isAvail = await this.isAvailable();
    if (!isAvail) throw new Error('Docker is not available');

    const data = await this.request(`/containers/${encodeURIComponent(containerId)}/stats?stream=false`, 'GET', null, { json: true });
    
    // CPU % calculation
    let cpuPercent = 0.0;
    const cpuDelta = (data.cpu_stats?.cpu_usage?.total_usage || 0) - (data.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta = (data.cpu_stats?.system_cpu_usage || 0) - (data.precpu_stats?.system_cpu_usage || 0);
    const onlineCPUs = data.cpu_stats?.online_cpus || data.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;

    if (systemDelta > 0 && cpuDelta > 0) {
      cpuPercent = (cpuDelta / systemDelta) * onlineCPUs * 100.0;
    }

    // Memory calculation
    const memUsage = (data.memory_stats?.usage || 0) - (data.memory_stats?.stats?.cache || 0);
    const memLimit = data.memory_stats?.limit || 1;
    const memPercent = (memUsage / memLimit) * 100.0;

    // Network I/O
    let netRx = 0;
    let netTx = 0;
    if (data.networks) {
      for (const netName of Object.keys(data.networks)) {
        netRx += data.networks[netName].rx_bytes || 0;
        netTx += data.networks[netName].tx_bytes || 0;
      }
    }

    // Block I/O
    let blockRead = 0;
    let blockWrite = 0;
    const ioEntries = data.blkio_stats?.io_service_bytes_recursive || [];
    for (const io of ioEntries) {
      if (io.op === 'read' || io.op === 'Read') blockRead += io.value || 0;
      if (io.op === 'write' || io.op === 'Write') blockWrite += io.value || 0;
    }

    return {
      containerId,
      readTime: data.read,
      cpu: {
        percent: Math.min(100.0 * onlineCPUs, Math.max(0, Number(cpuPercent.toFixed(2)))),
        onlineCpus: onlineCPUs
      },
      memory: {
        usageBytes: Math.max(0, memUsage),
        limitBytes: memLimit,
        percent: Math.min(100.0, Math.max(0, Number(memPercent.toFixed(2))))
      },
      network: {
        rxBytes: netRx,
        txBytes: netTx
      },
      blockIo: {
        readBytes: blockRead,
        writeBytes: blockWrite
      },
      pids: data.pids_stats?.current || 0
    };
  }

  async containerAction(containerId, action, options = {}) {
    const isAvail = await this.isAvailable();
    if (!isAvail) throw new Error('Docker is not available');

    const id = encodeURIComponent(containerId);
    switch (action) {
      case 'start':
        return await this.request(`/containers/${id}/start`, 'POST');
      case 'stop': {
        const timeout = options.timeout !== undefined ? options.timeout : 10;
        return await this.request(`/containers/${id}/stop?t=${timeout}`, 'POST');
      }
      case 'restart': {
        const timeout = options.timeout !== undefined ? options.timeout : 10;
        return await this.request(`/containers/${id}/restart?t=${timeout}`, 'POST');
      }
      case 'pause':
        return await this.request(`/containers/${id}/pause`, 'POST');
      case 'unpause':
        return await this.request(`/containers/${id}/unpause`, 'POST');
      case 'kill': {
        const signal = options.signal || 'SIGKILL';
        return await this.request(`/containers/${id}/kill?signal=${signal}`, 'POST');
      }
      case 'remove': {
        const force = options.force ? 1 : 0;
        const v = options.volumes ? 1 : 0;
        return await this.request(`/containers/${id}?force=${force}&v=${v}`, 'DELETE');
      }
      default:
        throw new Error(`Unsupported container action: ${action}`);
    }
  }

  // ==========================================
  // Docker Compose Stacks
  // ==========================================
  async listStacks() {
    const containers = await this.listContainers({ all: true });
    const stacksMap = new Map();

    for (const c of containers) {
      const projectName = c.composeProject || '_standalone';
      if (!stacksMap.has(projectName)) {
        stacksMap.set(projectName, {
          name: projectName,
          isStandalone: projectName === '_standalone',
          containers: [],
          runningCount: 0,
          totalCount: 0
        });
      }

      const stack = stacksMap.get(projectName);
      stack.containers.push(c);
      stack.totalCount += 1;
      if (c.state === 'running') stack.runningCount += 1;
    }

    return Array.from(stacksMap.values());
  }

  // ==========================================
  // Images & Volumes
  // ==========================================
  async listImages() {
    const isAvail = await this.isAvailable();
    if (!isAvail) return [];

    try {
      const raw = await this.request('/images/json', 'GET', null, { json: true });
      if (!Array.isArray(raw)) return [];

      return raw.map((img) => {
        const tags = (img.RepoTags && img.RepoTags.length > 0 && img.RepoTags[0] !== '<none>:<none>')
          ? img.RepoTags
          : (img.RepoDigests || ['<dangling>']);

        return {
          id: img.Id,
          shortId: img.Id.replace(/^sha256:/, '').slice(0, 12),
          tags,
          primaryTag: tags[0] || '<none>',
          sizeBytes: img.Size,
          created: img.Created,
          containersCount: img.Containers || 0
        };
      });
    } catch (err) {
      console.error('Failed to list images:', err.message);
      return [];
    }
  }

  async pruneImages() {
    const isAvail = await this.isAvailable();
    if (!isAvail) throw new Error('Docker is not available');
    return await this.request('/images/prune?filters={"dangling":["true"]}', 'POST', null, { json: true });
  }

  async listVolumes() {
    const isAvail = await this.isAvailable();
    if (!isAvail) return [];

    try {
      const raw = await this.request('/volumes', 'GET', null, { json: true });
      const volumes = raw.Volumes || [];
      return volumes.map((v) => ({
        name: v.Name,
        driver: v.Driver,
        mountpoint: v.Mountpoint,
        createdAt: v.CreatedAt,
        labels: v.Labels || {},
        scope: v.Scope
      }));
    } catch (err) {
      console.error('Failed to list volumes:', err.message);
      return [];
    }
  }

  async pruneVolumes() {
    const isAvail = await this.isAvailable();
    if (!isAvail) throw new Error('Docker is not available');
    return await this.request('/volumes/prune', 'POST', null, { json: true });
  }

  // ==========================================
  // Container Logs
  // ==========================================
  async getContainerLogs(containerId, { tail = 200, timestamps = true } = {}) {
    const isAvail = await this.isAvailable();
    if (!isAvail) throw new Error('Docker is not available');

    const id = encodeURIComponent(containerId);
    const buffer = await this.request(
      `/containers/${id}/logs?stdout=1&stderr=1&tail=${tail}&timestamps=${timestamps ? 1 : 0}`,
      'GET'
    );

    return this.demuxDockerStream(buffer);
  }

  // Decode standard Docker multiplexed stream header: [STREAM_TYPE, 0, 0, 0, SIZE, SIZE, SIZE, SIZE]
  demuxDockerStream(buffer) {
    if (!Buffer.isBuffer(buffer)) return String(buffer);
    const lines = [];
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) {
        lines.push(buffer.slice(offset).toString('utf8'));
        break;
      }

      const streamType = buffer[offset]; // 1 = stdout, 2 = stderr
      const payloadSize = buffer.readUInt32BE(offset + 4);
      offset += 8;

      if (offset + payloadSize <= buffer.length) {
        const chunk = buffer.slice(offset, offset + payloadSize).toString('utf8');
        lines.push(chunk);
        offset += payloadSize;
      } else {
        lines.push(buffer.slice(offset).toString('utf8'));
        break;
      }
    }

    return lines.join('');
  }

  // ==========================================
  // Container Exec (Terminal)
  // ==========================================
  async createExecInstance(containerId, { cmd = ['/bin/sh'], tty = true } = {}) {
    const isAvail = await this.isAvailable();
    if (!isAvail) throw new Error('Docker is not available');

    const id = encodeURIComponent(containerId);
    const result = await this.request(`/containers/${id}/exec`, 'POST', {
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: tty,
      Cmd: cmd
    }, { json: true });

    return result.Id; // execId
  }

  // Stream logs over WebSocket
  async streamLogsToWebSocket(containerId, ws, { tail = 100 } = {}) {
    const isAvail = await this.isAvailable();
    if (!isAvail) {
      ws.send(JSON.stringify({ type: 'error', message: 'Docker is not available' }));
      return;
    }

    try {
      const config = this.getSocketConfig();
      const id = encodeURIComponent(containerId);
      const req = http.request({
        ...config,
        path: `/containers/${id}/logs?stdout=1&stderr=1&follow=1&tail=${tail}&timestamps=1`,
        method: 'GET'
      }, (res) => {
        res.on('data', (chunk) => {
          if (ws.readyState === ws.OPEN) {
            const cleanText = this.demuxDockerStream(chunk);
            ws.send(JSON.stringify({ type: 'docker.log', log: cleanText }));
          }
        });

        res.on('end', () => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'docker.log.end' }));
          }
        });

        ws.on('close', () => {
          req.destroy();
        });
      });

      req.on('error', (err) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      });

      req.end();
    } catch (err) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    }
  }

  // Attach WebSocket to Exec socket duplex
  async attachExecToWebSocket(execId, ws) {
    try {
      const socket = await this.getRawSocket(`/exec/${encodeURIComponent(execId)}/start`, 'POST', {
        'Content-Type': 'application/json'
      });

      // Send start exec payload
      socket.write(JSON.stringify({ Detach: false, Tty: true }));

      // Data from container -> Browser WebSocket
      socket.on('data', (chunk) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(chunk.toString('utf8'));
        }
      });

      socket.on('close', () => {
        if (ws.readyState === ws.OPEN) {
          ws.close();
        }
      });

      // Data from Browser WebSocket -> container stdin
      ws.on('message', (msg) => {
        if (!socket.destroyed) {
          socket.write(msg);
        }
      });

      ws.on('close', () => {
        socket.destroy();
      });
    } catch (err) {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n[Lỗi kết nối Terminal]: ${err.message}\r\n`);
        ws.close();
      }
    }
  }
}

module.exports = { DockerManager, dockerManager: new DockerManager() };
