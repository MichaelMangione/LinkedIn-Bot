FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV CHROME_PATH=/usr/bin/chromium
ENV CHROME_HEADLESS=true
ENV CHROME_BOT_DATA_DIR=/app/data/linkedin-bot-chrome
ENV DATA_DIR=/app/data
ENV TZ=America/New_York
ENV NODE_ENV=production

RUN mkdir -p /app/data logs

CMD ["node", "src/daemon.js"]
