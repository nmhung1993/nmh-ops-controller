const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');
const WebSocket = require('ws');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3003;
const JWT_SECRET = 'windows-controller-secret-key';
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// ============ DATA PERSISTENCE ============
function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ monitoredProcesses: [], discordWebhook: '' }, null, 2));
  }
  if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = [
      { username: 'admin', password: bcrypt.hashSync('admin123', 10), role: 'admin' },
      { username: 'user', password: bcrypt.hashSync('user123', 10), role: 'user' }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
  }
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    return { monitoredProcesses: [], discordWebhook: '' };
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ============ AUTH ============
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: user.username, role: user.role });
});

// ============ TELEMETRY ============
function getTelemetry() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  const cpuUsage = 100 - (totalIdle / totalTick) * 100;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // Disk usage via PowerShell
  let diskUsage = [];
  try {
    const { execSync } = require('child_process');
    const result = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter \\"DriveType=3\\" | Select-Object DeviceID,@{N=\'Size\';E={$_.Size}},@{N=\'FreeSpace\';E={$_.FreeSpace}} | ConvertTo-Json"',
      { encoding: 'utf8', windowsHide: true }
    );
    const parsed = JSON.parse(result);
    const disks = Array.isArray(parsed) ? parsed : [parsed];
    diskUsage = disks.map(d => ({
      drive: d.DeviceID,
      total: parseInt(d.Size) || 0,
      free: parseInt(d.FreeSpace) || 0,
      used: (parseInt(d.Size) || 0) - (parseInt(d.FreeSpace) || 0)
    }));
  } catch (e) {
    diskUsage = [];
  }

  // Network bytes
  let network = { sentBytes: 0, recvBytes: 0 };
  try {
    const { execSync } = require('child_process');
    const result = execSync(
      'powershell -NoProfile -Command "$i=Get-NetAdapter -Physical | Get-NetAdapterStatistics; $sent=($i | Measure-Object -Property SentBytes -Sum).Sum; $recv=($i | Measure-Object -Property ReceivedBytes -Sum).Sum; [PSCustomObject]@{Sent=$sent; Recv=$recv} | ConvertTo-Json"',
      { encoding: 'utf8', windowsHide: true }
    );
    const parsed = JSON.parse(result);
    network = { sentBytes: parsed.Sent || 0, recvBytes: parsed.Recv || 0 };
  } catch (e) {
    network = { sentBytes: 0, recvBytes: 0 };
  }

  return {
    timestamp: new Date().toISOString(),
    cpu: {
      usage: cpuUsage.toFixed(1),
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown'
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percent: ((usedMem / totalMem) * 100).toFixed(1)
    },
    disk: diskUsage,
    network: network,
    uptime: os.uptime(),
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`
  };
}

// ============ PROCESSES ============
function getProcesses() {
  return new Promise((resolve, reject) => {
    exec(
      'powershell -NoProfile -Command "Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64,@{N=\'MemoryMB\';E={[math]::Round($_.WorkingSet64/1MB,1)}},@{N=\'CPUPercent\';E={if($_.CPU){[math]::Round($_.CPU,1)}else{0}}},Path,StartTime | ConvertTo-Json -Depth 3"',
      { maxBuffer: 1024 * 1024 * 10, windowsHide: true },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          const parsed = JSON.parse(stdout);
          const procs = Array.isArray(parsed) ? parsed : [parsed];
          resolve(procs.map(p => ({
            pid: p.Id,
            name: p.ProcessName,
            cpu: p.CPUPercent || 0,
            memoryMB: p.MemoryMB || 0,
            path: p.Path || '',
            startTime: p.StartTime || null
          })));
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

function killProcess(pid) {
  return new Promise((resolve, reject) => {
    exec(`taskkill /PID ${pid} /F`, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

function startProcessRepo(path) {
  return new Promise((resolve, reject) => {
    try {
      // Use spawn with detached + ignore stdio so the GUI app doesn't hold
      // the stdio handles open, which would hang exec().
      const child = spawn(path, { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      resolve('Process started');
    } catch (err) {
      reject(err);
    }
  });
}

// ============ DISCORD NOTIFICATIONS ============
async function sendDiscordMessage(message) {
  const config = readConfig();
  const webhook = config.discordWebhook;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (e) {
    console.error('Discord send failed:', e.message);
  }
}

async function sendDiscordScreenshot(message, filePath) {
  const config = readConfig();
  const webhook = config.discordWebhook;
  if (!webhook || !fs.existsSync(filePath)) return;
  try {
    const form = new FormData();
    form.append('content', message);
    form.append('file', new Blob([fs.readFileSync(filePath)], { type: 'image/png' }), 'screenshot.png');
    const res = await fetch(webhook, { method: 'POST', body: form });
    if (!res.ok) {
      console.error('Discord screenshot HTTP error:', res.status, await res.text());
    }
  } catch (e) {
    console.error('Discord screenshot failed:', e.message);
  }
}

function captureScreen(filePath, processName) {
  return new Promise((resolve, reject) => {
    const safeProcessName = (processName || '').replace(/'/g, "''");
    // Use a single C# helper class compiled via Add-Type. This puts all
    // window-finding + capture logic in C# to avoid PowerShell scoping issues.
    const script = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Drawing,System.Windows.Forms @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;

public class WinCapture {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  private const int HWND_TOPMOST = -1;
  private const int HWND_NOTOPMOST = -2;
  private const uint SWP_NOSIZE = 0x0001;
  private const uint SWP_NOMOVE = 0x0002;
  private const uint SWP_SHOWWINDOW = 0x0040;
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  private const uint DWMWA_EXTENDED_FRAME_BOUNDS = 9;
  private const uint PW_RENDERFULLCONTENT = 2;
  private const int SW_SHOW = 5;
  private const int SW_RESTORE = 9;
  private const int SW_SHOWNA = 4;
  private const byte VK_MENU = 0x12;
  private const uint KEYEVENTF_KEYUP = 0x0002;

  public static IntPtr FindMainWindow(string processName) {
    System.Diagnostics.Process[] procs = System.Diagnostics.Process.GetProcessesByName(processName);
    if (procs.Length == 0) return IntPtr.Zero;
    HashSet<uint> pids = new HashSet<uint>();
    foreach (var p in procs) pids.Add((uint)p.Id);
    // Enumerate ALL top-level windows and pick the LARGEST one. The real main
    // window (e.g. "UltraViewer 6.6.124 - Free") is usually hidden to tray but
    // still has its real size, while MainWindowHandle may return a 0x0 placeholder.
    IntPtr best = IntPtr.Zero;
    long bestArea = 0;
    EnumWindows((hWnd, lParam) => {
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      if (pids.Contains(pid)) {
        RECT r;
        GetWindowRect(hWnd, out r);
        long w = r.Right - r.Left;
        long h = r.Bottom - r.Top;
        long area = w * h;
        if (area > bestArea) { bestArea = area; best = hWnd; }
      }
      return true;
    }, IntPtr.Zero);
    // Fallback: if no window had a real size, use MainWindowHandle
    if (best == IntPtr.Zero) {
      foreach (var p in procs) {
        IntPtr h = p.MainWindowHandle;
        if (h != IntPtr.Zero && IsWindow(h)) return h;
      }
    }
    return best;
  }

  public static bool BringToFront(IntPtr hwnd) {
    // Restore the window if it's minimized / hidden to tray
    if (IsIconic(hwnd)) {
      ShowWindow(hwnd, SW_RESTORE);
    } else {
      ShowWindow(hwnd, SW_SHOW);
    }
    ShowWindow(hwnd, SW_SHOWNA);

    // Force it to the top of the z-order, then remove the topmost flag.
    // This reliably brings the window above others even if hidden/minimized.
    SetWindowPos(hwnd, new IntPtr(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW);
    SetWindowPos(hwnd, new IntPtr(HWND_NOTOPMOST), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE);

    // Unlock foreground switching: Windows restricts SetForegroundWindow from
    // background processes. Simulating an Alt key press temporarily unlocks it.
    keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);              // Alt down
    keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); // Alt up

    // Attach to the foreground thread so we can reliably steal focus
    IntPtr foreground = GetForegroundWindow();
    uint fgPid;
    uint foregroundThread = GetWindowThreadProcessId(foreground, out fgPid);
    uint thisThread = GetCurrentThreadId();
    if (foregroundThread != thisThread) {
      AttachThreadInput(foregroundThread, thisThread, true);
      BringWindowToTop(hwnd);
      SetForegroundWindow(hwnd);
      AttachThreadInput(foregroundThread, thisThread, false);
    } else {
      BringWindowToTop(hwnd);
      SetForegroundWindow(hwnd);
    }

    SetActiveWindow(hwnd);
    SetFocus(hwnd);
    return true;
  }

  public static bool CaptureWindow(IntPtr hwnd, string filePath) {
    // Bring the window up from the notification area / tray.
    BringToFront(hwnd);
    System.Threading.Thread.Sleep(1500); // wait for window to come to foreground

    RECT rect;
    GetWindowRect(hwnd, out rect);
    int left = rect.Left;
    int top = rect.Top;
    int width = rect.Right - rect.Left;
    int height = rect.Bottom - rect.Top;

    // If window bounds are invalid (e.g. non-interactive session), fall back
    // to capturing the full active screen region.
    if (width <= 0 || height <= 0) {
      left = 0;
      top = 0;
      width = GetSystemMetrics(0);  // SM_CXSCREEN
      height = GetSystemMetrics(1); // SM_CYSCREEN
    }

    using (Bitmap bmp = new Bitmap(width, height)) {
      using (Graphics g = Graphics.FromImage(bmp)) {
        g.CopyFromScreen(left, top, 0, 0, bmp.Size);
      }
      bmp.Save(filePath);
    }
    return true;
  }
}
"@
$hwnd = [WinCapture]::FindMainWindow('${safeProcessName}')
if ($hwnd -eq [IntPtr]::Zero) {
  Write-Error "No visible window found for: ${safeProcessName}"
  exit 1
}
if (-not [WinCapture]::CaptureWindow($hwnd, '${filePath}')) {
  Write-Error "Failed to capture window for: ${safeProcessName}"
  exit 1
}
`;
    // Write script to a temp file to avoid Windows command-line length limit
    const scriptFile = path.join(DATA_DIR, `capture-${Date.now()}.ps1`);
    fs.writeFileSync(scriptFile, script, 'utf8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`, { windowsHide: true }, (err, stdout, stderr) => {
      try { fs.unlinkSync(scriptFile); } catch (e) {}
      if (err) {
        console.error('captureScreen exec error:', err.message);
        return reject(err);
      }
      if (!fs.existsSync(filePath)) {
        console.error('captureScreen: file NOT created. stderr:', stderr);
        return reject(new Error('Screenshot file not created'));
      }
      resolve(filePath);
    });
  });
}

// Bring the process window to front + take a screenshot, retrying several times.
// Some apps (e.g. UltraViewer, Parsec) take a while to show their window after
// launch, or fail to come to the foreground on the first try. This retries
// find-window + bring-to-front + capture until it succeeds or runs out of attempts.
async function captureWithRetry(shotPath, processName, maxAttempts = 5, delayMs = 6000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[Capture] Attempt ${attempt}/${maxAttempts} for "${processName}"...`);
    try {
      await captureScreen(shotPath, processName);
      console.log(`[Capture] Screenshot captured on attempt ${attempt}: ${shotPath}`);
      return shotPath;
    } catch (err) {
      console.log(`[Capture] Attempt ${attempt} failed for "${processName}": ${err.message}`);
      if (attempt < maxAttempts) {
        // Wait before retrying (bring to front again)
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

// ============ HISTORY PERSISTENCE ============
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading history:', e.message);
  }
  return [];
}

function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(relaunchHistory, null, 2));
  } catch (e) {
    console.error('Error saving history:', e.message);
  }
}

function addHistoryEntry(entry) {
  relaunchHistory.push(entry);
  // Keep history bounded (e.g. last 100 entries)
  if (relaunchHistory.length > 100) relaunchHistory.shift();
  saveHistory();
}

// ============ WATCHER ============
let watcherInterval = null;
let relaunchHistory = loadHistory();

function checkMonitoredProcesses() {
  const config = readConfig();
  const monitored = config.monitoredProcesses || [];
  if (monitored.length === 0) return;

  getProcesses().then(processes => {
    monitored.forEach(item => {
      if (!item.enabled) return;
      const running = processes.some(p => p.name.toLowerCase() === item.processName.toLowerCase());
      if (!running) {
        // Process is down, try to relaunch
        const now = Date.now();
        const lastRel = relaunchHistory.find(h => h.processName === item.processName);
        const cooldown = 30000; // 30 seconds cooldown
        if (!lastRel || (now - lastRel.lastAttempt) > cooldown) {
          console.log(`[Watcher] Process "${item.processName}" is DOWN. Launching: ${item.filePath}`);
          // Notify Discord that process is down, then wait 3s before relaunching
          sendDiscordMessage(`⚠️ **Cảnh báo Watchdog**\nTiến trình \`${item.processName}\` ĐÃ DỪNG!\nĐang cố gắng khởi động lại: \`${item.filePath}\``);
          setTimeout(() => {
          startProcessRepo(item.filePath)
            .then(() => {
              addHistoryEntry({ processName: item.processName, lastAttempt: now, status: 'relaunched' });
              broadcast({ type: 'relaunch', processName: item.processName, status: 'relaunched', time: new Date().toISOString() });
              // Notify Discord of successful relaunch
              sendDiscordMessage(`✅ **Watchdog đã khởi động lại**\nTiến trình \`${item.processName}\` đã được khởi động lại thành công.`);
              // After 30 seconds, capture screenshot and send to Discord
              console.log(`[Watcher] Scheduling screenshot for "${item.processName}" in 30s`);
              setTimeout(() => {
                console.log(`[Watcher] Capturing screenshot for "${item.processName}"...`);
                const shotPath = path.join(DATA_DIR, `screenshot-${item.processName}-${Date.now()}.png`);
                captureWithRetry(shotPath, item.processName)
                  .then(() => {
                    console.log(`[Watcher] Screenshot captured: ${shotPath}`);
                    sendDiscordScreenshot(`📸 **Ảnh chụp sau khi khởi động lại**\nTiến trình \`${item.processName}\` - 30 giây sau khi khởi động lại.`, shotPath);
                  })
                  .catch(err => {
                    console.error('Screenshot capture failed:', err.message);
                    sendDiscordMessage(`❌ Không thể chụp ảnh màn hình cho \`${item.processName}\`: ${err.message}`);
                  });
              }, 30000);
            })
            .catch(e => {
              addHistoryEntry({ processName: item.processName, lastAttempt: now, status: 'failed', error: e.message });
              broadcast({ type: 'relaunch', processName: item.processName, status: 'failed', time: new Date().toISOString() });
              // Notify Discord of failure
              sendDiscordMessage(`❌ **Khởi động lại THẤT BẠI**\nTiến trình \`${item.processName}\` không thể khởi động lại.\nLỗi: \`${e.message}\``);
            });
          }, 3000); // 3 second delay before relaunch
        }
      }
    });
  }).catch(err => {
    console.error('Watcher error:', err.message);
  });
}

// ============ WEBSOCKET ============
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('close', () => console.log('WebSocket client disconnected'));
});

// Telemetry broadcast every 2 seconds
setInterval(() => {
  broadcast({ type: 'telemetry', data: getTelemetry() });
}, 2000);

// ============ API ROUTES ============
app.get('/api/telemetry', authenticate, (req, res) => {
  res.json(getTelemetry());
});

app.get('/api/processes', authenticate, (req, res) => {
  getProcesses()
    .then(procs => res.json(procs))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/processes/:pid/kill', authenticate, requireAdmin, (req, res) => {
  killProcess(req.params.pid)
    .then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/processes/:pid/start', authenticate, requireAdmin, (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'Path required' });
  startProcessRepo(path)
    .then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// Config routes
app.get('/api/config', authenticate, (req, res) => {
  const config = readConfig();
  if (req.user.role !== 'admin') {
    res.json({ monitoredProcesses: config.monitoredProcesses.map(p => ({ ...p, filePath: undefined })) });
  } else {
    res.json(config);
  }
});

app.post('/api/config', authenticate, requireAdmin, (req, res) => {
  const { monitoredProcesses, discordWebhook } = req.body;
  if (!Array.isArray(monitoredProcesses)) {
    return res.status(400).json({ error: 'Invalid config' });
  }
  const config = { monitoredProcesses, discordWebhook: discordWebhook || '' };
  writeConfig(config);
  res.json({ success: true, config });
});

app.get('/api/config/relaunch-history', authenticate, requireAdmin, (req, res) => {
  res.json(relaunchHistory);
});

// Manual launch of a monitored process + Discord notification + screenshot
// If the process is already running, just bring its window to front + screenshot.
app.post('/api/processes/launch', authenticate, requireAdmin, async (req, res) => {
  const { processName, filePath } = req.body;
  if (!processName || !filePath) {
    return res.status(400).json({ error: 'processName and filePath required' });
  }
  const now = Date.now();
  // Check if the process is already running
  let existing = false;
  try {
    const running = await getProcesses();
    existing = running.some(p => p.name.toLowerCase() === processName.toLowerCase());
  } catch (e) {
    console.error('Error checking process:', e.message);
  }

  if (existing) {
    // Process already exists: bring window to front + capture screenshot
    console.log(`[Manual] Process "${processName}" already running. Opening window + screenshot.`);
    sendDiscordMessage(`🪟 **Tiến trình đã chạy**\n\`${processName}\` đã đang chạy. Đang mở cửa sổ và chụp ảnh màn hình.`);
    addHistoryEntry({ processName, lastAttempt: now, status: 'window-opened' });
    broadcast({ type: 'relaunch', processName, status: 'window-opened', time: new Date().toISOString() });
    // Wait 1.5s for the window to come to foreground, then screenshot
    // (with retries to bring the window to front until it opens)
    setTimeout(() => {
      const shotPath = path.join(DATA_DIR, `screenshot-${processName}-${Date.now()}.png`);
      captureWithRetry(shotPath, processName)
        .then(() => {
          sendDiscordScreenshot(`📸 **Ảnh chụp cửa sổ**\nTiến trình \`${processName}\` - đã mở cửa sổ và chụp ảnh.`, shotPath);
        })
        .catch(err => {
          console.error('Window screenshot capture failed:', err.message);
          sendDiscordMessage(`❌ Không thể chụp ảnh màn hình cho \`${processName}\`: ${err.message}`);
        });
    }, 1500);
    return res.json({ success: true, alreadyRunning: true });
  }

  // Process not running: launch it
  console.log(`[Manual] Launching process "${processName}" from ${filePath}`);
  sendDiscordMessage(`🚀 **Khởi động thủ công**\nTiến trình \`${processName}\` đang được khởi động thủ công từ: \`${filePath}\``);
  startProcessRepo(filePath)
    .then(() => {
      addHistoryEntry({ processName, lastAttempt: now, status: 'manual-launched' });
      broadcast({ type: 'relaunch', processName, status: 'manual-launched', time: new Date().toISOString() });
      sendDiscordMessage(`✅ **Đã khởi động thủ công**\nTiến trình \`${processName}\` đã được khởi động thành công.`);
      // Screenshot after 30s (with retries to bring the window to front until it opens)
      setTimeout(() => {
        const shotPath = path.join(DATA_DIR, `screenshot-${processName}-${Date.now()}.png`);
        captureWithRetry(shotPath, processName)
          .then(() => {
            sendDiscordScreenshot(`📸 **Ảnh chụp sau khởi động thủ công**\nTiến trình \`${processName}\` - 30 giây sau khi khởi động.`, shotPath);
          })
          .catch(err => {
            console.error('Manual screenshot capture failed:', err.message);
            sendDiscordMessage(`❌ Không thể chụp ảnh màn hình cho \`${processName}\`: ${err.message}`);
          });
      }, 30000);
      res.json({ success: true });
    })
    .catch(err => {
      sendDiscordMessage(`❌ **Khởi động thủ công THẤT BẠI**\nKhông thể khởi động \`${processName}\`.\nLỗi: \`${err.message}\``);
      res.status(500).json({ error: err.message });
    });
});

// Test endpoint for screenshot capture + Discord send
app.post('/api/test-screenshot', authenticate, requireAdmin, async (req, res) => {
  const { processName } = req.body;
  if (!processName) return res.status(400).json({ error: 'processName required' });
  const shotPath = path.join(DATA_DIR, `test-screenshot-${Date.now()}.png`);
  try {
    await captureScreen(shotPath, processName);
    console.log('Test screenshot captured:', shotPath, 'size:', fs.statSync(shotPath).size);
    await sendDiscordScreenshot(`🧪 **Test Screenshot** - ${processName}`, shotPath);
    res.json({ success: true, path: shotPath });
  } catch (err) {
    console.error('Test screenshot error:', err);
    res.status(500).json({ error: err.message });
  }
});

// User management
app.get('/api/users', authenticate, requireAdmin, (req, res) => {
  const users = readUsers().map(u => ({ username: u.username, role: u.role }));
  res.json(users);
});

app.post('/api/users', authenticate, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  const users = readUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'User exists' });
  }
  users.push({ username, password: bcrypt.hashSync(password, 10), role });
  writeUsers(users);
  res.json({ success: true });
});

app.delete('/api/users/:username', authenticate, requireAdmin, (req, res) => {
  const users = readUsers();
  const idx = users.findIndex(u => u.username === req.params.username);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  if (users[idx].username === 'admin') return res.status(400).json({ error: 'Cannot delete admin' });
  users.splice(idx, 1);
  writeUsers(users);
  res.json({ success: true });
});

app.post('/api/users/:username/password', authenticate, requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  const users = readUsers();
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.password = bcrypt.hashSync(password, 10);
  writeUsers(users);
  res.json({ success: true });
});

// ============ CRASH PROTECTION ============
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  sendDiscordMessage(`❌ **Server Error**\n\`\`\`${err.message}\`\`\``);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ============ SEEDER USER ============
// Creates a 'seeder' user with a fixed password on first run,
// then notifies Discord with the credentials + a condensed watchdog guide.
const SEEDER_PASSWORD = 'mE59S67cjMs3';
const DEPLOY_URL = 'https://monitor.nmhung1993.io.vn/';

function ensureSeederUser() {
  const users = readUsers();
  const existing = users.find(u => u.username === 'seeder');
  if (existing) {
    // Ensure the seeder user has the fixed password (update if changed)
    const isCorrect = bcrypt.compareSync(SEEDER_PASSWORD, existing.password);
    if (!isCorrect) {
      existing.password = bcrypt.hashSync(SEEDER_PASSWORD, 10);
      writeUsers(users);
    }
    return { password: SEEDER_PASSWORD, created: false };
  }
  users.push({
    username: 'seeder',
    password: bcrypt.hashSync(SEEDER_PASSWORD, 10),
    role: 'user'
  });
  writeUsers(users);
  return { password: SEEDER_PASSWORD, created: true };
}

// ============ START ============
ensureDataFiles();

// Create seeder user if it doesn't exist
const seederResult = ensureSeederUser();

// Start watcher (only on interval - no immediate test run at startup)
watcherInterval = setInterval(checkMonitoredProcesses, 10000);
checkMonitoredProcesses();

server.listen(PORT, () => {
  console.log(`Windows Controller Web App running at http://localhost:${PORT}`);
  console.log(`Default admin login: admin / admin123`);
  console.log(`Default user login: user / user123`);

  // Notify Discord with seeder credentials + concise watchdog guide (only on FIRST creation)
  if (seederResult && seederResult.created) {
    const pass = seederResult.password;
    sendDiscordMessage(`🎉 **Windows Controller đã sẵn sàng!**\n\n🔐 **Đăng nhập**\n👤 User: \`seeder\`\n🔑 Pass: \`${pass}\`\n🌐 URL: ${DEPLOY_URL}\n\n🛡️ **Hướng dẫn Watchdog**\n1. Vào trang **Watchdog** → Thêm tiến trình (tên + file)\n2. Khi tiến trình dừng, hệ thống **tự khởi động lại**\n3. Nút **🚀 Launch** để khởi động thủ công\n4. Ảnh chụp màn hình gửi lên **Discord sau 30s**\n5. Cấu hình **Webhook** để nhận thông báo`);
  }
});
