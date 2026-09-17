FROM node:20-bookworm-slim
WORKDIR /app

# wget: compose healthcheck. python/make/g++: native modules (better-sqlite3, sharp)
# on both amd64 and arm64 UGREEN NAS boxes.
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY production/ ./production/
COPY .env.example ./.env.example

RUN mkdir -p /app/prompts /app/data /app/output \
    /app/production/image/output \
    /app/production/video/output

VOLUME /app/data
EXPOSE 3000
CMD ["node", "src/index.js"]
