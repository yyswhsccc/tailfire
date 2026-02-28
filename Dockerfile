# Dockerfile for @tailfire/api
# Multi-stage build for pnpm monorepo

# =============================================================================
# Stage 1: Base with pnpm
# =============================================================================
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN corepack enable
WORKDIR /app

# =============================================================================
# Stage 2: Install dependencies
# =============================================================================
FROM base AS deps

# Copy workspace configuration files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for all workspace packages
COPY packages/database/package.json ./packages/database/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: Build
# =============================================================================
FROM base AS builder

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Copy source code
COPY . .

# Build in correct dependency order
RUN pnpm --filter @tailfire/database build
RUN pnpm --filter @tailfire/shared-types build
RUN pnpm --filter @tailfire/api build

# =============================================================================
# Stage 4: Production runner
# =============================================================================
FROM base AS runner

ENV NODE_ENV=production

# Install Chromium and dependencies for puppeteer-core PDF rendering
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Copy package files for pnpm workspace resolution
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Copy built packages
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/src/migrations ./packages/database/src/migrations
COPY --from=builder /app/packages/database/package.json ./packages/database/

COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Expose port (Railway injects PORT)
EXPOSE ${PORT:-3101}

# Health check using PORT env var (Railway injects this)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3101; require('http').get('http://localhost:' + port + '/api/v1/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the API
CMD ["node", "apps/api/dist/main.js"]
