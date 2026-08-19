#!/bin/sh
set -eu

SERVER_URL=""
INSTALL_ROOT="/volume1/@appdata/windows-controller-agent"
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
[ -x "$NODE_BIN" ] || { echo "Node.js 18+ was not found. Install the Synology Node.js package first." >&2; exit 1; }
[ -x "$NPM_BIN" ] || { echo "npm was not found. Install the Synology Node.js package first." >&2; exit 1; }
NODE_MAJOR="$($NODE_BIN -p 'Number(process.versions.node.split(".")[0])')"
[ "$NODE_MAJOR" -ge 18 ] || { echo "Node.js 18+ is required; found $($NODE_BIN --version)." >&2; exit 1; }

SOURCE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p "$INSTALL_ROOT/runtime" "$INSTALL_ROOT/state"
cp "$SOURCE_DIR/agent.js" "$SOURCE_DIR/package.json" "$INSTALL_ROOT/runtime/"
(cd "$INSTALL_ROOT/runtime" && "$NPM_BIN" install --omit=dev --no-audit --no-fund)

cat > "$INSTALL_ROOT/config.json" <<EOF
{"serverUrl":"$SERVER_URL","stateDir":"$INSTALL_ROOT/state"}
EOF
chmod 600 "$INSTALL_ROOT/config.json"

cat > /usr/local/etc/rc.d/WindowsControllerSynologyAgent.sh <<EOF
#!/bin/sh
PID_FILE="$INSTALL_ROOT/agent.pid"
LOG_FILE="$INSTALL_ROOT/agent.log"
case "\${1:-}" in
  start)
    [ -f "\$PID_FILE" ] && kill -0 "\$(cat "\$PID_FILE")" 2>/dev/null && exit 0
    nohup "$NODE_BIN" "$INSTALL_ROOT/runtime/agent.js" --config "$INSTALL_ROOT/config.json" >> "\$LOG_FILE" 2>&1 &
    echo \$! > "\$PID_FILE"
    ;;
  stop)
    [ -f "\$PID_FILE" ] && kill "\$(cat "\$PID_FILE")" 2>/dev/null || true
    rm -f "\$PID_FILE"
    ;;
  status) [ -f "\$PID_FILE" ] && kill -0 "\$(cat "\$PID_FILE")" 2>/dev/null ;;
  restart) "\$0" stop; sleep 1; "\$0" start ;;
  *) echo "Usage: \$0 {start|stop|restart|status}"; exit 1 ;;
esac
EOF
chmod 755 /usr/local/etc/rc.d/WindowsControllerSynologyAgent.sh
/usr/local/etc/rc.d/WindowsControllerSynologyAgent.sh restart

echo "NMH Ops Controller Synology Agent installed. Approve hostname $(hostname) in Central Server."
