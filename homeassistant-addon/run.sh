#!/usr/bin/with-contenv bashio
set -e
exec node /app/agent.js --config /data/options.json
