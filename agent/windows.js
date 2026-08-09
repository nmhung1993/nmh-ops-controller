const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

let previousCpuTimes = null;
let previousNetwork = null;
let previousNetworkAt = null;
let diskCache = { at: 0, value: [] };
let previousProcesses = new Map();
let previousProcessesAt = null;

function runPowerShell(script, options = {}) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      timeout: options.timeout || 20_000
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = (stderr || error.message).trim();
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}

function cpuUsage() {
  const current = os.cpus().map(cpu => ({ ...cpu.times }));
  if (!previousCpuTimes) {
    previousCpuTimes = current;
    return 0;
  }
  let idleDelta = 0;
  let totalDelta = 0;
  for (let index = 0; index < current.length; index += 1) {
    const before = previousCpuTimes[index];
    const after = current[index];
    for (const key of Object.keys(after)) totalDelta += after[key] - before[key];
    idleDelta += after.idle - before.idle;
  }
  previousCpuTimes = current;
  return totalDelta > 0 ? Math.max(0, Math.min(100, 100 - (idleDelta / totalDelta) * 100)) : 0;
}

async function getDisks() {
  if (Date.now() - diskCache.at < 30_000) return diskCache.value;
  try {
    const output = await runPowerShell(`
      Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
        Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress
    `);
    const parsed = JSON.parse(output || '[]');
    const disks = (Array.isArray(parsed) ? parsed : [parsed]).map(disk => {
      const total = Number(disk.Size || 0);
      const free = Number(disk.FreeSpace || 0);
      return { drive: disk.DeviceID, total, free, used: total - free };
    });
    diskCache = { at: Date.now(), value: disks };
  } catch {
    diskCache = { at: Date.now(), value: [] };
  }
  return diskCache.value;
}

async function getNetwork() {
  try {
    const output = await runPowerShell(`
      $stats = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Get-NetAdapterStatistics
      [PSCustomObject]@{
        Sent = ($stats | Measure-Object -Property SentBytes -Sum).Sum
        Received = ($stats | Measure-Object -Property ReceivedBytes -Sum).Sum
      } | ConvertTo-Json -Compress
    `);
    const current = JSON.parse(output || '{}');
    const now = Date.now();
    const elapsedSeconds = previousNetworkAt ? (now - previousNetworkAt) / 1000 : 0;
    const result = {
      sentBytes: Number(current.Sent || 0),
      recvBytes: Number(current.Received || 0),
      sentPerSecond: 0,
      recvPerSecond: 0
    };
    if (previousNetwork && elapsedSeconds > 0) {
      result.sentPerSecond = Math.max(0, (result.sentBytes - previousNetwork.sentBytes) / elapsedSeconds);
      result.recvPerSecond = Math.max(0, (result.recvBytes - previousNetwork.recvBytes) / elapsedSeconds);
    }
    previousNetwork = result;
    previousNetworkAt = now;
    return result;
  } catch {
    return { sentBytes: 0, recvBytes: 0, sentPerSecond: 0, recvPerSecond: 0 };
  }
}

async function collectTelemetry() {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const [disk, network] = await Promise.all([getDisks(), getNetwork()]);
  return {
    timestamp: new Date().toISOString(),
    cpu: {
      usage: Number(cpuUsage().toFixed(1)),
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown'
    },
    memory: {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      percent: Number(((usedMemory / totalMemory) * 100).toFixed(1))
    },
    disk,
    network,
    uptime: os.uptime(),
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`
  };
}

async function getProcesses() {
  const output = await runPowerShell(`
    Get-Process -ErrorAction SilentlyContinue |
      Select-Object Id,ProcessName,CPU,WorkingSet64,Path,StartTime |
      ConvertTo-Json -Depth 3 -Compress
  `, { maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
  const parsed = JSON.parse(output || '[]');
  const raw = Array.isArray(parsed) ? parsed : [parsed];
  const now = Date.now();
  const elapsedSeconds = previousProcessesAt ? (now - previousProcessesAt) / 1000 : 0;
  const coreCount = Math.max(os.cpus().length, 1);
  const next = new Map();
  const processes = raw.map(item => {
    const cpuSeconds = Number(item.CPU || 0);
    const before = previousProcesses.get(item.Id);
    const cpuPercent = before && elapsedSeconds > 0
      ? Math.max(0, Math.min(100, ((cpuSeconds - before.cpuSeconds) / elapsedSeconds / coreCount) * 100))
      : 0;
    next.set(item.Id, { cpuSeconds });
    return {
      pid: Number(item.Id),
      name: item.ProcessName || 'Unknown',
      cpuPercent: Number(cpuPercent.toFixed(1)),
      cpuSeconds: Number(cpuSeconds.toFixed(1)),
      memoryMB: Number((Number(item.WorkingSet64 || 0) / 1024 / 1024).toFixed(1)),
      path: item.Path || '',
      startTime: item.StartTime || null
    };
  });
  previousProcesses = next;
  previousProcessesAt = now;
  return processes;
}

function killProcess(pid) {
  return new Promise((resolve, reject) => {
    execFile('taskkill.exe', ['/PID', String(pid), '/F'], { windowsHide: true, timeout: 15_000 },
      (error, stdout, stderr) => error ? reject(new Error((stderr || error.message).trim())) : resolve(stdout.trim()));
  });
}

function launchServiceProcess(filePath) {
  return new Promise((resolve, reject) => {
    if (!path.win32.isAbsolute(filePath)) return reject(new Error('Executable path must be absolute'));
    try {
      const child = spawn(filePath, [], { detached: true, stdio: 'ignore', windowsHide: true });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve({ pid: child.pid });
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function getMachineFingerprint() {
  try {
    const value = await runPowerShell(`(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid`);
    return value.trim();
  } catch {
    return `${os.hostname()}-${os.arch()}`;
  }
}

module.exports = {
  runPowerShell,
  collectTelemetry,
  getProcesses,
  killProcess,
  launchServiceProcess,
  getMachineFingerprint
};
