FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10 --activate

# ── Build stage ───────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy workspace config first for better layer caching
COPY pnpm-workspace.yaml package.json tsconfig*.json ./
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/new-world/package.json ./artifacts/new-world/

# Install all deps — use --approve-builds to allow esbuild postinstall scripts
RUN pnpm install --no-frozen-lockfile --approve-builds

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

COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/api-server/public ./artifacts/api-server/public
COPY --from=builder /app/artifacts/api-server/data ./artifacts/api-server/data

RUN mkdir -p /data

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
