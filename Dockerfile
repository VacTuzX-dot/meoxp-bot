FROM oven/bun:debian

# Install system dependencies (ffmpeg, build tools for native modules, yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python-is-python3 \
    build-essential \
    libtool \
    autoconf \
    automake \
    && pip3 install --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY bun.lockb* ./

RUN bun install

COPY . .

CMD ["bun", "run", "index.js"]
