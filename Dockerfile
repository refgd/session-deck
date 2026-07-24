FROM node:22-slim AS builder
WORKDIR /app

# Install build dependencies for native modules (node-pty, better-sqlite3)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install backend dependencies. Ignore lifecycle scripts so root postinstall
# does not install frontend dependencies in this layer.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
# Build native backend modules skipped by --ignore-scripts.
RUN npm_config_build_from_source=true npm_config_nodedir=/usr/local npm rebuild node-pty better-sqlite3
RUN node -e "require('node-pty'); require('better-sqlite3');"

# Install frontend dependencies reproducibly from the lock file.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --ignore-scripts

# Copy source and build frontend
COPY frontend/ ./frontend/
RUN cd frontend && NODE_OPTIONS="--max-old-space-size=1024" npx vite build
COPY src/ ./src/

# --- Production stage ---
FROM node:22-slim
WORKDIR /app

# Runtime dependencies:
# - tmux for local session fallback
# - openssh-client for remote hosts
# - docker.io for Docker container hosts via the mounted Docker socket
# - curl for Docker health checks
RUN apt-get update \
  && apt-get install -y --no-install-recommends tmux openssh-client docker.io curl \
  && rm -rf /var/lib/apt/lists/*

# Copy built app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/package.json ./
COPY src/ ./src/
COPY public ./public
RUN node -e "require('node-pty'); require('better-sqlite3');"

# Create data directory for SQLite
RUN mkdir -p /app/data

# SSH config directory for optional in-container SSH config/known_hosts use.
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh

# Entrypoint starts the app. Managed SSH keys are stored under /app/data.
COPY <<'ENTRYPOINT' /app/entrypoint.sh
#!/bin/sh
exec node src/index.js
ENTRYPOINT
RUN chmod +x /app/entrypoint.sh

EXPOSE 7890
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${SESSION_DECK_PORT:-7890}/api/health >/dev/null || exit 1
CMD ["/app/entrypoint.sh"]
