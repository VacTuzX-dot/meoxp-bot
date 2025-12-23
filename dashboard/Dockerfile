FROM oven/bun:1-debian AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_ vars must be set at build time
ARG NEXT_PUBLIC_BOT_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_BOT_API_URL=$NEXT_PUBLIC_BOT_API_URL

RUN bun run build

# Production
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
