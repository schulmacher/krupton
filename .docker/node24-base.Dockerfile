# syntax=docker/dockerfile:1
FROM node:24-bookworm AS base

RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    python3 \
    pkg-config \
    clang \
    llvm \
    libclang-dev \
    liblz4-dev \
    libzstd-dev \
    libsnappy-dev \
    libbz2-dev \
 && rm -rf /var/lib/apt/lists/*

# 🦀 Install Rust toolchain via rustup (fast, ~1–2 min)
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Copy manifests (cache-friendly)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/**/package.json apps/
COPY packages/**/package.json packages/

# Install dependencies and link local workspaces
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

# Copy source
COPY . .

# 🏗️ Build everything
RUN pnpm build

# Set up runtime defaults
ENV NODE_ENV=production
WORKDIR /workspace
EXPOSE 3000

CMD ["pnpm", "--version"]
