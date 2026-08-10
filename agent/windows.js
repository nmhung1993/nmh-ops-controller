const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

let previousCpuTimes = null;
let previousNetwork = null;
let previousNetworkAt = null;
let diskCache = { at: 0, value: [] };
let hardwareCache = { at: 0, value: null };
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

function runExecutable(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      maxBuffer: options.maxBuffer || 2 * 1024 * 1024,
      timeout: options.timeout || 8_000
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = (stderr || error.message).trim();
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}

function optionalNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value, digits = 1) {
  return Number(Number(value).toFixed(digits));
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

async function getNvidiaSensors() {
  try {
    const output = await runExecutable('nvidia-smi.exe', [
      '--query-gpu=index,name,temperature.gpu,power.draw,power.limit',
      '--format=csv,noheader,nounits'
    ]);
    return output.split(/\r?\n/).filter(Boolean).map(line => {
      const [index, name, temperature, power, powerLimit] = line.split(',').map(value => value.trim());
      const temperatureC = optionalNumber(temperature);
      const powerW = optionalNumber(power);
      const limitW = optionalNumber(powerLimit);
      return {
        id: `gpu-${index}`,
        type: 'gpu',
        name: name || `GPU ${index}`,
        temperatureC: temperatureC === null ? null : rounded(temperatureC),
        powerW: powerW === null ? null : rounded(powerW, 2),
        limitW: limitW === null ? null : rounded(limitW, 2),
        source: 'nvidia-smi'
      };
    });
  } catch {
    return [];
  }
}

async function getAcpiThermalZones() {
  try {
    const output = await runPowerShell(`
      $zones = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue |
        Where-Object { $_.CurrentTemperature -gt 0 })
      @($zones | ForEach-Object {
        [PSCustomObject]@{
          Name = $_.InstanceName
          Celsius = [Math]::Round(($_.CurrentTemperature / 10) - 273.15, 1)
        }
      }) | ConvertTo-Json -Compress
    `, { timeout: 8_000 });
    const parsed = JSON.parse(output || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map((zone, index) => ({
      id: `thermal-zone-${index}`,
      type: 'thermal-zone',
      name: zone.Name || `ACPI thermal zone ${index + 1}`,
      temperatureC: optionalNumber(zone.Celsius),
      powerW: null,
      limitW: null,
      source: 'acpi-wmi'
    }));
  } catch {
    return [];
  }
}

async function getWindowsPowerMeters() {
  try {
    const output = await runPowerShell(`
      $rows = @()
      foreach ($counterPath in @('\\Energy Meter(*)\\Power', '\\Power Meter(*)\\Power')) {
        try {
          $samples = @(Get-Counter -Counter $counterPath -ErrorAction Stop).CounterSamples
          foreach ($sample in $samples) {
            if ($sample.CookedValue -ge 0) {
              $rows += [PSCustomObject]@{
                Name = $sample.InstanceName
                Watts = [Math]::Round([double]$sample.CookedValue, 2)
                Counter = $counterPath
              }
            }
          }
        } catch {}
      }
      @($rows) | ConvertTo-Json -Compress
    `, { timeout: 8_000 });
    const parsed = JSON.parse(output || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map((meter, index) => ({
      id: `power-meter-${index}`,
      type: 'system',
      name: meter.Name || `Windows power meter ${index + 1}`,
      powerW: optionalNumber(meter.Watts),
      limitW: null,
      source: meter.Counter === '\\Energy Meter(*)\\Power' ? 'windows-energy-meter' : 'windows-power-meter'
    }));
  } catch {
    return [];
  }
}

function hardwareType(identifier, reportedType) {
  const value = `${identifier || ''} ${reportedType || ''}`.toLowerCase();
  if (value.includes('cpu')) return 'cpu';
  if (value.includes('gpu')) return 'gpu';
  if (value.includes('storage') || value.includes('hdd')) return 'storage';
  if (value.includes('mainboard') || value.includes('motherboard')) return 'motherboard';
  if (value.includes('memory') || value.includes('ram')) return 'memory';
  return 'system';
}

function groupHardwareMonitorRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const parent = row.Parent || row.Identifier || `hardware-${grouped.size}`;
    const id = `monitor-${String(parent).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;
    const current = grouped.get(id) || {
      id,
      type: hardwareType(parent, row.HardwareType),
      name: row.HardwareName || parent,
      temperatureC: null,
      powerW: null,
      limitW: null,
      source: row.Provider || (String(row.Namespace || '').includes('Libre') ? 'librehardwaremonitor-wmi' : 'openhardwaremonitor-wmi'),
      powerPriority: 0
    };
    const sensorValue = optionalNumber(row.Value);
    if (row.SensorType === 'Temperature' && sensorValue !== null) {
      current.temperatureC = current.temperatureC === null ? rounded(sensorValue) : Math.max(current.temperatureC, rounded(sensorValue));
    }
    if (row.SensorType === 'Power' && sensorValue !== null) {
      const priority = /package|total/i.test(row.SensorName || '') ? 2 : 1;
      if (priority > current.powerPriority || (priority === current.powerPriority && sensorValue > (current.powerW || 0))) {
        current.powerW = rounded(sensorValue, 2);
        current.powerPriority = priority;
      }
    }
    grouped.set(id, current);
  }
  return [...grouped.values()].map(({ powerPriority, ...component }) => component);
}

async function getHardwareBridgeRows() {
  try {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const bridgeFile = path.join(programData, 'WindowsController', 'hardware-monitor', 'hardware-sensors.json');
    const payload = JSON.parse(await fs.promises.readFile(bridgeFile, 'utf8'));
    if (!payload.sampledAt || Date.now() - new Date(payload.sampledAt).getTime() > 30_000) return [];
    return (Array.isArray(payload.sensors) ? payload.sensors : []).map(sensor => ({
      Provider: 'librehardwaremonitor-bridge',
      Identifier: sensor.sensorId,
      Parent: sensor.hardwareId,
      SensorName: sensor.sensorName,
      SensorType: sensor.sensorType,
      Value: sensor.value,
      HardwareName: sensor.hardwareName,
      HardwareType: sensor.hardwareType
    }));
  } catch {
    return [];
  }
}

async function getHardwareMonitorSensors() {
  const bridgeRows = await getHardwareBridgeRows();
  if (bridgeRows.length) return groupHardwareMonitorRows(bridgeRows);
  try {
    const output = await runPowerShell(`
      $rows = @()
      foreach ($namespace in @('root/LibreHardwareMonitor', 'root/OpenHardwareMonitor')) {
        try {
          $hardware = @{}
          Get-CimInstance -Namespace $namespace -ClassName Hardware -ErrorAction Stop | ForEach-Object {
            $hardware[$_.Identifier] = $_
          }
          Get-CimInstance -Namespace $namespace -ClassName Sensor -ErrorAction Stop |
            Where-Object { $_.SensorType -in @('Temperature', 'Power') -and $_.Value -ne $null } |
            ForEach-Object {
              $owner = $hardware[$_.Parent]
              $rows += [PSCustomObject]@{
                Namespace = $namespace
                Identifier = $_.Identifier
                Parent = $_.Parent
                SensorName = $_.Name
                SensorType = $_.SensorType
                Value = [double]$_.Value
                HardwareName = $owner.Name
                HardwareType = $owner.HardwareType
              }
            }
        } catch {}
      }
      @($rows) | ConvertTo-Json -Compress
    `, { timeout: 10_000 });
    const parsed = JSON.parse(output || '[]');
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
    return groupHardwareMonitorRows(rows);
  } catch {
    return [];
  }
}

async function getHardwareSensors() {
  if (hardwareCache.value && Date.now() - hardwareCache.at < 5_000) return hardwareCache.value;
  const [gpus, thermalZones, powerMeters, monitorComponents] = await Promise.all([
    getNvidiaSensors(), getAcpiThermalZones(), getWindowsPowerMeters(), getHardwareMonitorSensors()
  ]);
  const components = [
    ...monitorComponents.filter(component => component.type !== 'gpu' || gpus.length === 0),
    ...gpus,
    ...thermalZones,
    ...powerMeters
  ];
  const temperatures = components
    .filter(component => component.temperatureC !== null)
    .map(({ id, type, name, temperatureC, source }) => ({ id, type, name, celsius: temperatureC, source }));
  const powerParts = components
    .filter(component => component.powerW !== null)
    .map(({ id, type, name, powerW, limitW, source }) => ({ id, type, name, watts: powerW, limitWatts: limitW, source }));
  const systemMeter = powerParts.find(component =>
    component.source === 'windows-energy-meter' || component.source === 'windows-power-meter'
  );
  const totalW = systemMeter?.watts ?? (powerParts.length
    ? rounded(powerParts.reduce((sum, component) => sum + component.watts, 0), 2)
    : null);
  const value = {
    sampledAt: new Date().toISOString(),
    temperatures,
    power: {
      totalWatts: totalW,
      coverage: systemMeter ? 'system-meter' : (powerParts.length ? 'partial' : 'unavailable'),
      parts: powerParts
    },
    sources: [...new Set(components.map(component => component.source))]
  };
  hardwareCache = { at: Date.now(), value };
  return value;
}

async function collectTelemetry() {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const [disk, network, hardware] = await Promise.all([getDisks(), getNetwork(), getHardwareSensors()]);
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
    hardware,
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
  getMachineFingerprint,
  getHardwareSensors
};
