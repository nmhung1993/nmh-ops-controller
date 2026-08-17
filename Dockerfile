FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY frontend/dist ./frontend/dist
RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=3003
ENV DATA_DIR=/app/data
ENV TZ=Asia/Bangkok

EXPOSE 3003
CMD ["node", "server/server.js"]
