# syntax=docker/dockerfile:1.7
# ---- Builder stage ----
# Pinned to a specific digest for reproducible builds and security.
FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS builder
WORKDIR /app

# Install deps (cached layer).
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-fund --no-audit

# Build the app.  `output: "standalone"` in next.config.ts produces a
# minimal server bundle we copy in the runtime stage.
COPY . .
RUN --mount=type=cache,target=/app/.next/cache npm run build

# ---- Runtime stage ----
# Pinned to same digest as builder for reproducibility.
FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4444
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Install only production deps.
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-fund --no-audit

# Copy the standalone output: server.js, .next/standalone, .next/static.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The .cache dir is written at runtime; make it writable for a non-root user.
RUN mkdir -p /app/.cache && chown -R 1000:1000 /app

USER 1000:1000

EXPOSE 4444

# Use the standalone server entrypoint instead of `npm start` (avoids
# the npm parent-process layer, faster signal handling, smaller surface).
CMD ["node", "server.js"]
