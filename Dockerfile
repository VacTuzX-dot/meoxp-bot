FROM oven/bun:debian

# Install system dependencies 
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY bun.lockb* ./

RUN bun install

COPY . .

# Build TypeScript
RUN bun run build

CMD ["bun", "run", "start"]
