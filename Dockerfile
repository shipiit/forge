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
# hand. This is the dashboard-only build — a client gets their run log, not the
# marketing site — and its mount path is stamped in at request time, so one
# bundle works at / and at /usage.
RUN cd web \
  && npm ci \
  && VITE_TARGET=dashboard npm run build \
  && mkdir -p /app/dist/ui \
  && cp -r dist-dashboard/* /app/dist/ui/ \
  && rm -rf node_modules dist dist-dashboard

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/server.js"]
