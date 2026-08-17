# Central Server image for Synology Container Manager and other Docker hosts.
FROM node:24-alpine AS ui-build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY frontend ./frontend
COPY vite.config.js ./
RUN npm run build

FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=ui-build /app/public ./public
RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=3003
ENV DATA_DIR=/app/data
ENV TZ=Asia/Bangkok
EXPOSE 3003
CMD ["node", "server/server.js"]
