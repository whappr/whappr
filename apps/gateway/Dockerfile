# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /whappr

ENV NODE_ENV=development \
    PUPPETEER_SKIP_DOWNLOAD=true

# Manifests only, for layer caching. All three workspace package.json files
# are needed so npm can resolve the workspace graph declared in the root
# package.json, even though only apps/gateway gets installed/built below.
COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/flue/package.json packages/flue/package.json

RUN npm ci --workspace apps/gateway --include-workspace-root

COPY tsconfig.json tsconfig.build.json ./
COPY apps/gateway apps/gateway

RUN npm run build --workspace apps/gateway

FROM node:24-alpine AS runtime
WORKDIR /whappr

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --spider -q http://127.0.0.1:${PORT:-3000}/health || exit 1

# Alpine's system Chromium (works on musl) plus the shared libs it needs to
# render headless, and tini as PID 1 to reap the Chromium child processes
# whatsapp-web.js/Puppeteer spawns.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont tini

# Manifests only, kept separate from the compiled app below so this layer's
# cache only busts when dependencies actually change, not on every source edit.
COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/flue/package.json packages/flue/package.json

RUN npm ci --omit=dev --omit=optional --workspace apps/gateway --include-workspace-root

COPY --from=build /whappr/apps/gateway/dist apps/gateway/dist
COPY apps/gateway/public apps/gateway/public

RUN chown -R node:node apps/gateway

USER node

# Switches cwd for the app itself (./public and its default session dir
# resolve relative to this), separate from /whappr above which npm needed
# for workspace resolution.
WORKDIR /whappr/apps/gateway

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
