# syntax=docker/dockerfile:1

# ── build: full deps + vite build (adapter-node → ./build) ──────────────────
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ── deps: production-only node_modules for the externalised runtime imports ──
# (adapter-node bundles app code but leaves mysql2 / drizzle-orm / better-auth
#  etc. as bare imports, so the runtime still needs their packages present.)
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ── runtime: slim node, migrate-then-serve ──────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# adapter-node reads these to trust Coolify's reverse proxy for form actions.
ENV PROTOCOL_HEADER=x-forwarded-proto
ENV HOST_HEADER=x-forwarded-host
# adapter-node defaults to a 512K body limit, which rejects attachment uploads well under UPLOAD_MAX_MB.
ENV BODY_SIZE_LIMIT=20M

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/build        ./build
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts

EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node build"]
