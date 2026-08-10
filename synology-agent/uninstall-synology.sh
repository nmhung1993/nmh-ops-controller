#!/bin/sh
set -eu

INSTALL_ROOT="${1:-/volume1/@appdata/windows-controller-agent}"
SERVICE_SCRIPT="/usr/local/etc/rc.d/WindowsControllerSynologyAgent.sh"
[ "$(id -u)" -eq 0 ] || { echo "Run as root with sudo." >&2; exit 1; }

if [ -x "$SERVICE_SCRIPT" ]; then "$SERVICE_SCRIPT" stop || true; fi
rm -f "$SERVICE_SCRIPT"
echo "Service removed. Agent identity and buffered data remain in $INSTALL_ROOT/state."
echo "Delete $INSTALL_ROOT manually only if you want a completely new enrollment identity."
