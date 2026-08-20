# Stage 1: Build Frontend
FROM node:24-alpine AS builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Server
FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY agent ./agent
COPY linux-agent ./linux-agent
COPY synology-agent ./synology-agent
COPY homeassistant-addon ./homeassistant-addon
RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=3003
ENV DATA_DIR=/app/data
ENV TZ=Asia/Bangkok

EXPOSE 3003
CMD ["node", "server/server.js"]
