# Optional Central Server-only image. The supported LAN deployment uses the
# Windows service installer because agents and desktop helpers require Windows.
FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=3003
ENV DATA_DIR=/app/data
EXPOSE 3003
CMD ["node", "server/server.js"]
