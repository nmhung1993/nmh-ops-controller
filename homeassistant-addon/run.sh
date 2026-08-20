#!/usr/bin/with-contenv bashio

echo "[NMH Ops] Starting Home Assistant Connector..."
while true; do
  node /app/agent.js --config /data/options.json
  EXIT_CODE=$?
  echo "[NMH Ops] Connector process exited with code ${EXIT_CODE}. Relaunching in 1s..."
  sleep 1
done

