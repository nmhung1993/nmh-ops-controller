# ============================================================
# Windows Controller - Docker Deployment
# ============================================================
# IMPORTANT: This Docker image CANNOT fully monitor a Windows
# host machine. Docker containers are isolated from the host:
#   - Cannot access host CPU/memory/disk telemetry (uses os module)
#   - Cannot enumerate host processes (Get-Process is Windows-host)
#   - Cannot capture host window screenshots for Discord
#
# This image is provided for running the web UI + user/process
# management in a containerized environment, but telemetry and
# window capture will report the CONTAINER's state, not the host.
#
# For full functionality on a real Windows machine, use the
# Windows autorun scripts in /autorun instead.
# ============================================================

FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY server ./server
COPY public ./public

# Data directory (config, users, screenshots)
RUN mkdir -p /app/data

# Expose the web port
EXPOSE 3003

# Run the server
CMD ["node", "server/server.js"]