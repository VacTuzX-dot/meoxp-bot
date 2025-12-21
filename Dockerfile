FROM oven/bun:debian

# Install system dependencies (ffmpeg, build tools for native modules)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python-is-python3 \
    build-essential \
    libtool \
    autoconf \
    automake \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY bun.lockb* ./

RUN bun install

COPY . .

CMD ["bun", "run", "index.js"]
