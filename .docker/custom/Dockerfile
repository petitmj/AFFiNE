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

# Frontends. Each build is followed by a check so a silent failure stops the
# build here, with a clear message, instead of surfacing later as a missing
# COPY source. The outputs are then moved to /out, away from the workspace, so
# that nothing done to the workspace afterwards (the production-only install
# below) can touch them.
RUN yarn affine @affine/web build && \
  test -f packages/frontend/apps/web/dist/index.html && \
  mkdir -p /out && cp -r packages/frontend/apps/web/dist /out/web
RUN yarn affine @affine/admin build && \
  test -f packages/frontend/admin/dist/index.html && \
  cp -r packages/frontend/admin/dist /out/admin
RUN yarn affine @affine/mobile build && \
  test -f packages/frontend/apps/mobile/dist/index.html && \
  cp -r packages/frontend/apps/mobile/dist /out/mobile
# Server bundle. Checked and stashed like the frontends: the start command runs
# ./dist/main.js, so an image without it can only crash-loop.
RUN yarn workspace @affine/server build && \
  test -f packages/backend/server/dist/main.js && \
  ls -l packages/backend/server/dist | head -20 && \
  cp -r packages/backend/server/dist /out/server-dist

# Production dependencies only, and the generated Prisma client. Re-installing
# can run workspace lifecycle scripts, so the server bundle is put back from
# the stash afterwards and checked again.
RUN yarn workspaces focus @affine/server --production && \
  yarn workspace @affine/server prisma generate && \
  mv node_modules packages/backend/server/node_modules && \
  rm -rf packages/backend/server/dist && \
  cp -r /out/server-dist packages/backend/server/dist && \
  test -f packages/backend/server/dist/main.js

# ----------------------------------------------------------------- assets ---
FROM node:22-bookworm-slim AS assets
ARG TARGETARCH
WORKDIR /app

COPY --from=builder /repo/packages/backend/server /app
COPY --from=builder /out/web /app/static
COPY --from=builder /out/admin /app/static/admin
COPY --from=builder /out/mobile /app/static/mobile

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl ca-certificates && \
  rm -rf /var/lib/apt/lists/*

RUN AFFINE_DOCKER_CLEAN=1 TARGETARCH="${TARGETARCH}" node ./scripts/docker-clean.mjs && \
  test -f /app/dist/main.js && test -f /app/static/index.html

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
