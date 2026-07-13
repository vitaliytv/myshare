# Build context is the myshare repo ROOT (bun workspace), not relay/ itself —
# same as ory's per-service Dockerfiles (e.g. jwt-bridge/Dockerfile), since
# `relay` is a workspace member sharing the root lockfile, not a standalone
# package. Build with: docker build -f relay/Dockerfile .
FROM mirror.gcr.io/oven/bun:alpine
WORKDIR /app

# Root manifests + every workspace's package.json, so `--filter relay` can
# resolve/install only relay's dependency subtree from the shared lockfile.
COPY package.json bun.lock bunfig.toml ./
COPY app/package.json ./app/package.json
COPY scripts/package.json ./scripts/package.json
COPY relay/package.json ./relay/package.json
RUN bun install --frozen-lockfile --production --filter relay

COPY relay/src ./relay/src

WORKDIR /app/relay
EXPOSE 8787

USER 1000
CMD ["bun", "run", "src/server.js"]
