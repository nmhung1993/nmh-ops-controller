#!/bin/sh
set -eu

PROJECT_DIR=""
DATA_DIR="/volume1/docker/windows-controller/data"
PORT="3003"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Run as root with sudo." >&2; exit 1; }
[ -n "$PROJECT_DIR" ] || { echo "--project-dir is required." >&2; exit 1; }
[ -f "$PROJECT_DIR/Dockerfile" ] || { echo "Dockerfile is missing from $PROJECT_DIR." >&2; exit 1; }
[ -f "$PROJECT_DIR/package-lock.json" ] || { echo "package-lock.json is missing from $PROJECT_DIR." >&2; exit 1; }
if ! command -v docker >/dev/null 2>&1; then
  for docker_root in /var/packages/ContainerManager/target/usr/bin /var/packages/Docker/target/usr/bin; do
    if [ -x "$docker_root/docker" ]; then PATH="$docker_root:$PATH"; export PATH; break; fi
  done
fi
command -v docker >/dev/null 2>&1 || { echo "Synology Container Manager/Docker is required." >&2; exit 1; }

case "$PORT" in *[!0-9]*|'') echo "--port must be numeric." >&2; exit 1;; esac
mkdir -p "$DATA_DIR"
chmod 700 "$DATA_DIR"
export WC_DATA_DIR="$DATA_DIR"
export WC_PORT="$PORT"
export COMPOSE_PROJECT_NAME="windows-controller"

if command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f "$PROJECT_DIR/synology-server/compose.yaml" up -d --build
else
  docker compose -f "$PROJECT_DIR/synology-server/compose.yaml" up -d --build
fi

echo "Central Server started on port $PORT. Open http://<synology-lan-ip>:$PORT"
