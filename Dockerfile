FROM oven/bun:debian

# Install system dependencies 
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY bun.lockb* ./

RUN bun install --production

COPY . .

# Build TypeScript
RUN bun run build

# Performance optimizations
ENV UV_THREADPOOL_SIZE=16
ENV NODE_OPTIONS="--max-old-space-size=512"

CMD ["bun", "run", "dist/index.js"]
