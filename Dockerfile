FROM oven/bun:debian

# Install system dependencies 
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY bun.lockb* ./

# Install all dependencies (including dev for build)
RUN bun install

COPY . .

# Build TypeScript
RUN bun run build

# Remove dev dependencies after build
RUN rm -rf node_modules && bun install --production

# Performance optimizations
ENV UV_THREADPOOL_SIZE=16
ENV NODE_OPTIONS="--max-old-space-size=512"

CMD ["bun", "run", "dist/index.js"]
