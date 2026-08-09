# Windows Controller Web App

A web application to monitor Windows system telemetry, manage running processes, and automatically restart applications when monitored processes stop running.

## Features

- 📊 **Dashboard** - Real-time telemetry: CPU usage, memory, disk, network, uptime, OS info
  - **Disk usage** displayed as a pie/doughnut chart
  - **CPU, Memory, Network** displayed as live line charts with history tracking
- ⚙️ **Processes** - List all running processes with PID, CPU, memory, path; search and kill processes (admin)
- 🛡️ **Watchdog** - Configure monitored processes; if a process stops, automatically launch the specified file
  - **Discord notifications** via webhook when a process goes down, is restarted, or fails to restart
  - **Automatic screenshot** captured 30 seconds after a successful restart and sent to Discord
- 👑 **Admin Panel** - Manage users (create, delete, set passwords), assign roles (admin/user)
- 🔐 **Authentication** - Role-based access control (admin vs viewer)
- 📡 **Real-time** - Live updates via WebSocket

## Getting Started

### Prerequisites

- Node.js (v14+)
- Windows OS (uses PowerShell commands for telemetry)

### Installation

```bash
npm install
```

### Run

```bash
npm start
```

The app runs at `http://localhost:3003` (or `PORT` env var).

### Default Accounts

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |
| User | `user` | `user123` |

## Usage

### Dashboard
Shows live CPU, memory, disk, network, uptime, and system info. Updates in real-time every 2 seconds.

### Processes
- View all running processes with PID, name, CPU seconds, memory usage (MB), and executable path
- Search by name or path
- **Admin only**: Kill processes

### Watchdog
- **Admin only**: Add monitored processes by specifying:
  - Process name (e.g., `notepad`)
  - Executable file path to launch when process is down (e.g., `C:\Windows\System32\notepad.exe`)
  - Enable/disable the rule
- The watcher checks every 10 seconds. If a monitored process is not running, it launches the file (with a 30-second cooldown to avoid loops).
- View relaunch history.
- **Discord integration** (admin only):
  - Set a webhook URL in the Watchdog page
  - Receives notifications: process down ⚠️, restart success ✅, restart failure ❌
  - Captures a screenshot 30s after successful restart and sends it to Discord 📸

### Admin Panel
- **Admin only**: Manage users
  - Create users with role (admin/user)
  - Delete users
  - Set passwords

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/login` | Login, get JWT token | None |
| GET | `/api/telemetry` | System telemetry | User |
| GET | `/api/processes` | Running processes | User |
| POST | `/api/processes/:pid/kill` | Kill process | Admin |
| POST | `/api/processes/:pid/start` | Start process by path | Admin |
| GET | `/api/config` | Watchdog config | User |
| POST | `/api/config` | Update watchdog config + Discord webhook | Admin |
| GET | `/api/config/relaunch-history` | Relaunch history | Admin |
| GET | `/api/users` | List users | Admin |
| POST | `/api/users` | Create user | Admin |
| DELETE | `/api/users/:username` | Delete user | Admin |
| POST | `/api/users/:username/password` | Set password | Admin |

## Docker Deployment (Limited)

> ⚠️ **Important**: A Docker container **cannot** fully monitor a real Windows host machine. Docker isolates the container from the host, so:
> - Telemetry (CPU/memory/disk/network) reports the **container's** state, not the host
> - Process listing (`Get-Process`) and window screenshots only work on a Windows host
> - Discord window capture will fail inside a container

The included `Dockerfile` is provided for running the web UI in a containerized environment, but for **full functionality on a real Windows machine**, use the Windows autorun scripts.

## Windows Autorun (Recommended)

To run the server automatically at Windows startup (so it starts monitoring and the watchdog works from boot):

1. Ensure Node.js is installed
2. Run the installer:
   ```
   autorun\install-autorun.bat
   ```
3. This copies `start-hidden.vbs` to your Windows Startup folder and creates a shortcut
4. The server will now start **hidden** at every login and run at `http://localhost:3003`

To remove autorun, delete the `WindowsController` files from:
```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
```

## Project Structure

```
├── server/
│   └── server.js          # Backend: API, telemetry, processes, watcher, auth
├── public/
│   ├── index.html         # Frontend pages
│   ├── css/
│   │   └── style.css      # Styling
│   ├── js/
│   │   └── app.js         # Frontend logic
│   └── lang/
│       ├── en.json        # English translations
│       └── vi.json        # Vietnamese translations
├── autorun/
│   ├── install-autorun.bat # Installs Windows startup autorun
│   └── start-hidden.vbs    # Starts server hidden at login
├── data/                  # Persisted config/users (created on first run)
│   ├── config.json        # Watchdog config
│   └── users.json         # User credentials (hashed)
├── Dockerfile             # Limited Docker packaging (see note above)
├── package.json
└── README.md
```

## Security Notes

- Passwords are hashed with bcrypt
- JWT tokens expire after 24 hours
- Change the default passwords after first login
- The JWT secret is stored in `server/server.js` - change it for production