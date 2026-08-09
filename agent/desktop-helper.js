const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const configFile = process.argv.includes('--config')
  ? process.argv[process.argv.indexOf('--config') + 1]
  : process.env.WC_HELPER_CONFIG || path.join(process.env.PROGRAMDATA || '.', 'WindowsController', 'agent', 'helper.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return fallback; }
}

const config = readJson(configFile, null);
if (!config?.pipeName || !config?.secret || !config?.stateDir) {
  console.error(`Desktop helper config is missing: ${configFile}`);
  process.exit(1);
}
fs.mkdirSync(config.stateDir, { recursive: true });
const logFile = path.join(path.dirname(configFile), 'desktop-helper.log');

function log(message) {
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\r\n`, 'utf8'); } catch {}
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}

function launch(filePath) {
  if (!path.win32.isAbsolute(filePath)) throw new Error('Executable path must be absolute');
  const child = spawn(filePath, [], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return { pid: child.pid };
}

function buildWindowScript(processName, outputPath = null) {
  const safeName = escapePowerShell(processName);
  const action = outputPath
    ? `$handle = [WindowAutomation]::ActivateBest('${safeName}')
if ($handle -eq [IntPtr]::Zero) { if ([WindowAutomation]::HasCandidate('${safeName}')) { throw 'window_activation_failed' } else { throw 'window_not_found' } }
if (-not [WindowAutomation]::Capture($handle, '${escapePowerShell(outputPath)}')) { throw 'screenshot_failed' }`
    : `$handle = [WindowAutomation]::ActivateBest('${safeName}')
if ($handle -eq [IntPtr]::Zero) { if ([WindowAutomation]::HasCandidate('${safeName}')) { throw 'window_activation_failed' } else { throw 'window_not_found' } }`;
  return `
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public class WindowAutomation {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr state);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint command);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr state);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public class Candidate {
    public IntPtr Handle; public long Area; public bool Visible; public bool ToolWindow; public bool Titled; public bool Owned;
  }
  public static System.Collections.Generic.List<Candidate> Candidates(string name) {
    var processes = System.Diagnostics.Process.GetProcessesByName(name);
    var ids = new System.Collections.Generic.HashSet<uint>();
    foreach (var p in processes) ids.Add((uint)p.Id);
    var candidates = new System.Collections.Generic.List<Candidate>();
    EnumWindows((hWnd, state) => {
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      if (ids.Contains(pid) && IsWindow(hWnd)) {
        RECT r;
        if (GetWindowRect(hWnd, out r)) {
          long width = r.Right-r.Left, height = r.Bottom-r.Top;
          if (width > 0 && height > 0) {
            candidates.Add(new Candidate {
              Handle = hWnd,
              Area = width * height,
              Visible = IsWindowVisible(hWnd),
              ToolWindow = (GetWindowLong(hWnd, -20) & 0x80) != 0,
              Titled = GetWindowTextLength(hWnd) > 0,
              Owned = GetWindow(hWnd, 4) != IntPtr.Zero
            });
          }
        }
      }
      return true;
    }, IntPtr.Zero);
    foreach (var p in processes) p.Dispose();
    candidates.Sort((left, right) => {
      int value = left.ToolWindow.CompareTo(right.ToolWindow);
      if (value != 0) return value;
      value = right.Visible.CompareTo(left.Visible);
      if (value != 0) return value;
      value = left.Owned.CompareTo(right.Owned);
      if (value != 0) return value;
      value = right.Titled.CompareTo(left.Titled);
      return value != 0 ? value : right.Area.CompareTo(left.Area);
    });
    return candidates;
  }
  public static bool HasCandidate(string name) { return Candidates(name).Count > 0; }
  public static IntPtr Find(string name) {
    var candidates = Candidates(name);
    return candidates.Count > 0 ? candidates[0].Handle : IntPtr.Zero;
  }
  public static IntPtr ActivateBest(string name) {
    foreach (var candidate in Candidates(name)) {
      if (Activate(candidate.Handle)) return candidate.Handle;
    }
    return IntPtr.Zero;
  }
  public static bool Activate(IntPtr hWnd) {
    if (!IsWindow(hWnd)) return false;
    if (!IsWindowVisible(hWnd)) ShowWindowAsync(hWnd, 5);
    ShowWindowAsync(hWnd, 9);
    SetWindowPos(hWnd, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040);
    SetWindowPos(hWnd, new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040);
    SetForegroundWindow(hWnd);
    System.Threading.Thread.Sleep(800);
    return IsWindowVisible(hWnd);
  }
  public static bool Capture(IntPtr hWnd, string file) {
    if (!Activate(hWnd)) return false;
    RECT r; if (!GetWindowRect(hWnd, out r)) return false;
    int width = r.Right-r.Left, height = r.Bottom-r.Top; if (width <= 0 || height <= 0) return false;
    using (var bitmap = new Bitmap(width, height)) using (var graphics = Graphics.FromImage(bitmap)) {
      IntPtr hdc = graphics.GetHdc();
      bool rendered = PrintWindow(hWnd, hdc, 2);
      graphics.ReleaseHdc(hdc);
      if (!rendered) graphics.CopyFromScreen(r.Left, r.Top, 0, 0, bitmap.Size);
      bitmap.Save(file);
    }
    return true;
  }
}
"@
${action}
`;
}

function runWindowScript(processName, outputPath = null) {
  const script = buildWindowScript(processName, outputPath);
  const scriptFile = path.join(config.stateDir, `window-${Date.now()}.ps1`);
  fs.writeFileSync(scriptFile, script, 'utf8');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile], {
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      try { fs.unlinkSync(scriptFile); } catch {}
      if (error || (outputPath && !fs.existsSync(outputPath))) {
        const detail = (stderr || error?.message || (outputPath ? 'screenshot_failed' : 'window_activation_failed')).trim();
        if (detail.includes('window_not_found')) return reject(new Error('window_not_found'));
        if (detail.includes('window_activation_failed')) return reject(new Error('window_activation_failed'));
        if (detail.includes('interactive_session_unavailable')) return reject(new Error('interactive_session_unavailable'));
        return reject(new Error('screenshot_failed'));
      }
      resolve(outputPath ? { filePath: outputPath } : { activated: true });
    });
  });
}

function activate(processName) {
  return runWindowScript(processName);
}

function capture(processName, requestedOutputPath) {
  const captureRoot = path.resolve(config.stateDir);
  const outputPath = path.resolve(requestedOutputPath || '');
  if (!outputPath.startsWith(`${captureRoot}${path.sep}`) || path.extname(outputPath).toLowerCase() !== '.png') {
    throw new Error('invalid_screenshot_path');
  }
  return runWindowScript(processName, outputPath);
}

const pipeServer = net.createServer(socket => {
  socket.setEncoding('utf8');
  let buffer = '';
  let handled = false;
  socket.on('data', async chunk => {
    buffer += chunk;
    if (buffer.length > 1024 * 1024) return socket.destroy();
    const newline = buffer.indexOf('\n');
    if (newline < 0 || handled) return;
    handled = true;
    let request;
    try { request = JSON.parse(buffer.slice(0, newline)); } catch { return socket.end('{"ok":false,"error":"invalid_json"}\n'); }
    const activeConfig = readJson(configFile, config);
    if (!sameSecret(request.secret, activeConfig.secret)) return socket.end('{"ok":false,"error":"unauthorized"}\n');
    try {
      let result;
      if (request.action === 'launch') result = launch(request.payload?.filePath);
      else if (request.action === 'activate') result = await activate(request.payload?.processName);
      else if (request.action === 'capture') result = await capture(request.payload?.processName, request.payload?.outputPath);
      else throw new Error('unsupported_action');
      log(`${request.action} succeeded`);
      socket.end(`${JSON.stringify({ ok: true, result })}\n`);
    } catch (error) {
      log(`${request.action || 'unknown'} failed: ${error.message}`);
      socket.end(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    }
  });
});

try { fs.unlinkSync(config.pipeName); } catch {}
pipeServer.on('error', error => {
  log(`pipe error: ${error.message}`);
  process.exit(1);
});
pipeServer.listen(config.pipeName, () => {
  log(`started for ${process.env.USERDOMAIN || '.'}\\${process.env.USERNAME || 'unknown'} on ${config.pipeName}`);
  console.log(`Desktop helper listening on ${config.pipeName}`);
});
process.on('SIGINT', () => pipeServer.close(() => process.exit(0)));
process.on('uncaughtException', error => {
  log(`uncaught exception: ${error.stack || error.message}`);
  process.exit(1);
});
process.on('unhandledRejection', error => {
  log(`unhandled rejection: ${error?.stack || error}`);
  process.exit(1);
});
