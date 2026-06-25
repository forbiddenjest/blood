FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# ── Build stage ───────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy workspace config first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json tsconfig*.json ./
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/new-world/package.json ./artifacts/new-world/

# Install all deps
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY artifacts/ ./artifacts/

# Build frontend
RUN pnpm --filter @workspace/new-world run build

# Build API server
RUN cd artifacts/api-server && node build.mjs

# Wire frontend into API server
RUN rm -rf artifacts/api-server/public && \
    cp -r artifacts/new-world/dist/public artifacts/api-server/public

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-slim AS production
WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/api-server/public ./artifacts/api-server/public
COPY --from=builder /app/artifacts/api-server/data ./artifacts/api-server/data

# Data directory (Railway volume mounts here)
RUN mkdir -p /data

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080
# DATA_DIR_OVERRIDE is set via Railway environment variable to /data for persistence

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
