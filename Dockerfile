FROM oven/bun:debian

# Install system dependencies (ffmpeg is required for music, python3 might be needed for some build tools, but try without first if possible, though play-dl/ytdl often needs it)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY bun.lockb* ./

RUN bun install --production

COPY . .

CMD ["bun", "run", "index.js"]
