# syntax=docker/dockerfile:1.7
#
# Builds this fork of AFFiNE (web app, admin, mobile web, server and the
# native module) from source and packages it the way the official image is
# packaged (see .github/deployment/node/Dockerfile). Build from the repo root:
#
#   docker build -f .docker/custom/Dockerfile -t affine-shelf:local .
#
# Needs about 12 GB of RAM for Docker and 30 GB of free disk; the first build
# takes 30 to 60 minutes. Later builds reuse the cached dependency layers.

# ---------------------------------------------------------------- builder ---
FROM node:22-bookworm AS builder
ARG TARGETARCH
ARG BUILD_TYPE=stable
WORKDIR /repo

RUN apt-get update && \
  apt-get install -y --no-install-recommends \
    build-essential cmake pkg-config libssl-dev python3 jq curl git ca-certificates && \
  rm -rf /var/lib/apt/lists/*

# Rust: rustup reads the exact version from rust-toolchain.toml on first use.
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none

RUN corepack enable

ENV HUSKY=0 \
  CI=1 \
  BUILD_TYPE=${BUILD_TYPE} \
  NODE_OPTIONS=--max-old-space-size=8192

COPY . .

RUN --mount=type=cache,target=/root/.yarn/berry/cache \
  yarn install --immutable

# Native module for the server. The server bundle looks for an architecture
# named file (see packages/backend/native/index.js), as the official build does.
RUN yarn affine @affine/server-native build && \
  case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
    amd64) ARCH=x64 ;; \
    arm64) ARCH=arm64 ;; \
    *) echo "unsupported architecture" && exit 1 ;; \
  esac && \
  mv packages/backend/native/server-native.node "packages/backend/native/server-native.${ARCH}.node"

RUN yarn affine @affine/web build
RUN yarn affine @affine/admin build
RUN yarn affine @affine/mobile build
RUN yarn workspace @affine/server build

# Production dependencies only, and the generated Prisma client.
RUN yarn workspaces focus @affine/server --production && \
  yarn workspace @affine/server prisma generate && \
  mv node_modules packages/backend/server/node_modules

# ----------------------------------------------------------------- assets ---
FROM node:22-bookworm-slim AS assets
ARG TARGETARCH
WORKDIR /app

COPY --from=builder /repo/packages/backend/server /app
COPY --from=builder /repo/packages/frontend/apps/web/dist /app/static
COPY --from=builder /repo/packages/frontend/admin/dist /app/static/admin
COPY --from=builder /repo/packages/frontend/apps/mobile/dist /app/static/mobile

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl ca-certificates && \
  rm -rf /var/lib/apt/lists/*

RUN AFFINE_DOCKER_CLEAN=1 TARGETARCH="${TARGETARCH}" node ./scripts/docker-clean.mjs

# ---------------------------------------------------------------- runtime ---
FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=assets /app /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl libjemalloc2 ca-certificates && \
  rm -rf /var/lib/apt/lists/*

ENV LD_PRELOAD=libjemalloc.so.2

EXPOSE 3010

CMD ["sh", "-c", "node ./scripts/upgrade-config.js && exec node ./dist/main.js"]
