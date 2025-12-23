FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./

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

CMD ["node", "dist/index.js"]
