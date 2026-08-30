FROM oven/bun:1.3.14-slim AS bun

FROM node:22.22.0-bookworm-slim AS build

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/fixtures/package.json packages/fixtures/package.json
COPY packages/schemas/package.json packages/schemas/package.json

RUN bun install --frozen-lockfile

COPY apps apps
COPY packages packages
COPY scripts scripts
COPY licenses licenses

ARG ENABLE_GOOGLE_LOGIN=false
ENV NODE_ENV=production

RUN VITE_GOOGLE_AUTH_ENABLED=${ENABLE_GOOGLE_LOGIN} bun run build

FROM oven/bun:1.3.14-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=bun:bun /app/apps/api/dist apps/api/dist
COPY --from=build --chown=bun:bun /app/apps/web/dist apps/web/dist
COPY --chown=bun:bun LICENSE ./LICENSE
COPY --from=build --chown=bun:bun /app/apps/web/dist/third-party-notices.txt ./THIRD_PARTY_NOTICES.txt

USER bun

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["bun", "-e", "const response = await fetch(`http://127.0.0.1:${process.env.PORT || process.env.API_PORT || 8787}/api/health`); process.exit(response.ok ? 0 : 1)"]

CMD ["bun", "apps/api/dist/index.js"]
