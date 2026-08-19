#!/bin/sh
set -eu

SERVER_URL=""
INSTALL_ROOT="/var/lib/windows-controller-agent"
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --server-url) SERVER_URL="$2"; shift 2 ;;
    --install-root) INSTALL_ROOT="$2"; shift 2 ;;
    --node) NODE_BIN="$2"; shift 2 ;;
    --npm) NPM_BIN="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Run as root with sudo." >&2; exit 1; }
[ -n "$SERVER_URL" ] || { echo "--server-url is required" >&2; exit 1; }
[ -x "$NODE_BIN" ] || { echo "Node.js 18+ was not found." >&2; exit 1; }
[ -x "$NPM_BIN" ] || { echo "npm was not found." >&2; exit 1; }
NODE_MAJOR="$($NODE_BIN -p 'Number(process.versions.node.split(".")[0])')"
[ "$NODE_MAJOR" -ge 18 ] || { echo "Node.js 18+ is required; found $($NODE_BIN --version)." >&2; exit 1; }

SOURCE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
RUNTIME_DIR="$INSTALL_ROOT/runtime"
STATE_DIR="$INSTALL_ROOT/state"
mkdir -p "$RUNTIME_DIR" "$STATE_DIR"
cp "$SOURCE_DIR/agent.js" "$SOURCE_DIR/package.json" "$RUNTIME_DIR/"
(cd "$RUNTIME_DIR" && "$NPM_BIN" install --omit=dev --no-audit --no-fund)
cat > "$INSTALL_ROOT/config.json" <<EOF
{"serverUrl":"$SERVER_URL","stateDir":"$STATE_DIR"}
EOF
chmod 600 "$INSTALL_ROOT/config.json"
chmod 700 "$INSTALL_ROOT" "$STATE_DIR"

SERVICE_FILE="/etc/systemd/system/windows-controller-agent.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=NMH Ops Controller Linux Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$RUNTIME_DIR
ExecStart=$NODE_BIN $RUNTIME_DIR/agent.js --config $INSTALL_ROOT/config.json
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$INSTALL_ROOT
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload
  systemctl enable --now windows-controller-agent.service
else
  echo "systemd is required to start the Linux Agent automatically." >&2
  exit 1
fi

echo "Linux Agent installed. Approve hostname $(hostname) in Central Server."
