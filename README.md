# Windows Controller Fleet

Windows Controller is a Central Server plus Windows Agent system for monitoring and controlling up to 20 Windows machines on a trusted LAN.

## Architecture

```text
Browser -- HTTP/WebSocket --> Central Server
                                ^
                                | outbound WebSocket
                       Windows Agent Service
                                |
                         local named pipe
                                |
                       Desktop Helper at logon
```

The Central Server no longer reads its own Windows processes directly. Install an agent on the Central Server machine as well, so it appears and behaves like every other managed host.

## Requirements

- Windows 10/11 or Windows Server
- Node.js 22.5 or newer (Node.js 24 LTS recommended)
- Administrator access for service and firewall installation
- A trusted Private-profile LAN
- A static IP or DHCP reservation for the Central Server

The default deployment uses plain HTTP. Do not port-forward TCP 3003 or expose it to the Internet. Put the service behind HTTPS before using it outside a trusted LAN.

## Development Run

```powershell
npm.cmd install
npm.cmd start
```

Open `http://localhost:3003`. If no legacy users were imported, the first page creates the initial administrator. There are no default credentials.

To run an agent without installing a service:

```powershell
Copy-Item agent\config.example.json agent\config.json
# Update serverUrl in agent\config.json first.
node agent\agent.js --config agent\config.json
```

The agent appears in Admin > Pending agents. Compare its MachineGuid fingerprint with the installer output before approval.

## Install Central Server

Run an elevated PowerShell terminal:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\install-server.ps1 -Port 3003
```

The installer:

- copies the Central Server to `%ProgramData%\WindowsController\server`;
- installs production dependencies;
- downloads and configures WinSW;
- installs an automatic Windows service;
- opens TCP 3003 only for the Windows Private network profile;
- imports legacy `users.json`, `config.json`, and `history.json` on first start.

Set a DHCP reservation or static IP before installing agents. Open the displayed `http://<server-ip>:3003` address from another LAN machine to verify access.

## Install an Agent

Copy the `agent` directory to the target machine and run an elevated PowerShell terminal:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\agent\install-agent.ps1 -ServerUrl "http://192.168.1.10:3003"
```

The installer creates:

- `Windows Controller Agent`, an automatic LocalSystem service;
- a logon Scheduled Task for the Desktop Helper;
- a DPAPI-protected per-machine agent token;
- a Private-profile outbound firewall rule;
- a fingerprint shown at the end of installation.

The Desktop Helper is launched through `wscript.exe` with a hidden window, so no Node.js console should appear during normal service startup. Its diagnostic log is `%ProgramData%\WindowsController\agent\helper\desktop-helper.log`.

Approve the pending agent in the Admin page. Repeat the same installation on the Central Server machine so it is monitored too.

For CPU Package, mainboard, storage and additional temperature/power sensors, install LibreHardwareMonitor from its official GitHub release in the same elevated terminal:

```powershell
.\agent\install-hardware-monitor.ps1
```

The script installs the newest stable LibreHardwareMonitor release plus a local Microsoft .NET 10 SDK/Windows Desktop Runtime under `%ProgramData%\WindowsController\dotnet`. It builds a small bridge against the official `LibreHardwareMonitorLib`, then runs that bridge invisibly as `SYSTEM` through the `Windows Controller Hardware Monitor` startup task. On first start, the bridge attempts to extract and silently install LibreHardwareMonitor's official embedded PawnIO driver, which enables CPU MSR and motherboard LPC access on supported X99/dual-Xeon systems. If the driver is unavailable, the bridge continues with any sensors Windows/LHM can read and records the reason in `hardware-probe.log`. The bridge writes `%ProgramData%\WindowsController\hardware-monitor\hardware-sensors.json` every five seconds, so monitoring does not depend on the LibreHardwareMonitor GUI or its legacy WMI provider. For an offline LHM package, pass `-PackagePath "C:\path\LibreHardwareMonitor.NET.10.zip"`; the .NET installer still requires access to Microsoft's official download endpoint on first installation.

Uninstall while preserving state:

```powershell
.\agent\uninstall-agent.ps1
```

Add `-RemoveData` only when intentionally deleting enrollment state and cached watchdog configuration.

## Runtime Behavior

- Telemetry is sent every 2 seconds and persisted every 10 seconds.
- Telemetry is retained for 7 days in SQLite WAL mode.
- Events and command audit records are retained for 30 days.
- Agent offline status is detected within 20 seconds.
- An offline agent buffers 10 minutes of telemetry and up to 1,000 events.
- Watchdog rules run every 10 seconds from the agent cache, even if Central Server is unavailable.
- Commands are idempotent by `commandId` and expire after 60 seconds.
- Full process lists are fetched only on demand.
- WinSW only hosts the Agent service; it does not expose hardware sensors. The Agent queries supported providers directly: `nvidia-smi` for NVIDIA temperature/power and ACPI WMI thermal zones when the motherboard firmware exposes them.
- Hardware power is reported per readable component. `totalWatts` is the sum of those measured parts and is marked `partial` unless Windows exposes a real Energy/Power Meter; missing CPU/mainboard wattage is never estimated. CPU/package and mainboard sensors generally require the bundled LibreHardwareMonitor bridge or OpenHardwareMonitor with its WMI provider enabled.

Interactive launch and window capture require a logged-in desktop session. The Agent Service handles telemetry and service-mode processes before login; the Desktop Helper handles GUI applications and screenshots after login.

When an administrator presses **Launch** for an interactive watchdog rule, the agent checks whether the process already exists. A running application is restored and brought to the foreground; if no window exists, the executable is launched again so single-instance applications can reveal their UI. The agent then captures the window after 30 seconds (1.5 seconds when it was already running), retrying five times. Central Server sends one Vietnamese Discord notification with the screenshot; if capture fails, it sends one Vietnamese error notification instead. Capture uses `PrintWindow` with a screen-copy fallback. A `service`-mode rule cannot capture a desktop window because it runs in Session 0.

## Security Model

- New agents remain pending until an administrator approves their fingerprint.
- Each agent has its own revocable random token; only its SHA-256 hash is stored centrally.
- The local token is protected with machine-scope Windows DPAPI.
- Browser WebSockets require JWT authentication.
- Viewer accounts cannot approve agents, modify watchdog rules, send commands, or see executable paths.
- No remote shell endpoint exists. Supported mutations are process kill, configured watchdog launch, and window capture.
- Discord webhook configuration remains on Central Server and is never distributed to agents.

Because HTTP was selected for this LAN deployment, credentials and tokens are not encrypted in transit. Treat every device on the LAN as trusted, and migrate to HTTPS if that assumption changes.

## API Overview

All fleet endpoints are host-scoped under `/api/v1`:

- `GET /hosts`, `GET /hosts/:id`, `GET /hosts/:id/telemetry`
- `GET /hosts/:id/processes`
- `POST /hosts/:id/commands`
- `GET|PUT /hosts/:id/watchdog`
- `GET /hosts/:id/events`, `GET /hosts/:id/commands`
- `GET /agents/pending`, `POST /agents/:id/approve`, `POST /agents/:id/revoke`

Agent and browser realtime traffic use `/ws/agent` and `/ws/ui` on the same port.

## Data and Backups

Central data is stored in `data/windows-controller.db` for development or `%ProgramData%\WindowsController\server\data` for a service installation. A consistent SQLite backup is created daily in `data/backups`.

Legacy JSON files are copied to `data/legacy-backup` before migration. Existing watchdog rules and relaunch history attach to the first enrolled agent whose hostname matches the Central Server hostname.

## Tests

```powershell
npm.cmd run check
npm.cmd test
```

The integration test starts an isolated Central Server, creates the first administrator, enrolls and approves a simulated agent, sends telemetry, completes a command, and revokes the agent.
