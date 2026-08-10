ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.21
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY agent.js run.sh ./
RUN chmod +x /app/run.sh
CMD ["/app/run.sh"]
