# ShipIT Forge — GitHub App webhook server.
FROM node:22-slim

# git is required for cloning target repositories; ripgrep speeds up search.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .
RUN npm install --no-save typescript && npm run build

# The dashboard is served by the agent, from the same origin as its data, so a
# self-hosted deployment needs no CORS origin and no API base URL typed in by
# hand. VITE_BASE matches the mount path.
RUN cd web \
  && npm ci \
  && VITE_BASE="/usage/" npm run build \
  && mkdir -p /app/dist/ui \
  && cp -r dist/* /app/dist/ui/ \
  && rm -rf node_modules

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/server.js"]
