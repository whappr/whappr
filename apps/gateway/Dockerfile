# syntax=docker/dockerfile:1

FROM node:alpine AS build
WORKDIR /whappr

# Manifests only, for layer caching. All three workspace package.json files
# are needed so npm can resolve the workspace graph declared in the root
# package.json, even though only apps/gateway gets installed/built below.
COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/flue/package.json packages/flue/package.json

# whatsapp-web.js pulls in puppeteer, which would otherwise download a glibc
# Chromium build that can't run on Alpine's musl libc anyway. The runtime
# stage installs Alpine's own system Chromium instead.
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN npm ci --workspace apps/gateway --include-workspace-root

COPY tsconfig.json tsconfig.build.json ./
COPY apps/gateway apps/gateway

RUN npm run build --workspace apps/gateway

# Reinstall production-only deps in place for a clean, deterministic result.
RUN rm -rf node_modules apps/gateway/node_modules
RUN npm ci --omit=dev --workspace apps/gateway --include-workspace-root


FROM node:alpine AS runtime
WORKDIR /whappr/apps/gateway

# Alpine's system Chromium (works on musl) plus the shared libs it needs to
# render headless, and tini as PID 1 to reap the Chromium child processes
# whatsapp-web.js/Puppeteer spawns.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont tini
RUN chown node:node /whappr/apps/gateway

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

COPY --from=build --chown=node:node /whappr/node_modules /whappr/node_modules
COPY --from=build --chown=node:node /whappr/apps/gateway/dist ./dist
COPY --from=build --chown=node:node /whappr/apps/gateway/package.json ./package.json
COPY --chown=node:node apps/gateway/public ./public

USER node

EXPOSE 3000
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
