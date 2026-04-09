FROM node:24-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Git hook setup is for local development only and should not run in image builds.
ENV SKIP_GIT_HOOKS=1

COPY package.json pnpm-lock.yaml* ./
COPY scripts/install-git-hooks.mjs ./scripts/install-git-hooks.mjs

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .

# Build TypeScript
RUN pnpm run build

# Remove dev dependencies after build
RUN pnpm prune --prod

# Performance optimizations
ENV UV_THREADPOOL_SIZE=16
ENV NODE_OPTIONS="--max-old-space-size=512"

# Wait for Lavalink to be ready before starting the bot
COPY wait-for-lavalink.js ./
CMD ["node", "wait-for-lavalink.js"]
