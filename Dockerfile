# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/bff/package.json apps/bff/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci --ignore-scripts

FROM dependencies AS development
ENV NODE_ENV=development NPM_CONFIG_CACHE=/tmp/npm-cache
COPY . .
RUN mkdir -p /workspace/.artifacts /workspace/test-results /var/lib/iacoc-v2 /run/iacoc-secrets \
  && chown -R node:node /workspace /var/lib/iacoc-v2 /run/iacoc-secrets
USER node
CMD ["npm", "run", "dev:web", "--", "--host", "0.0.0.0", "--port", "5174"]

FROM dependencies AS test
ENV NODE_ENV=test PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NPM_CONFIG_CACHE=/tmp/npm-cache
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates chromium \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN mkdir -p /workspace/.artifacts /workspace/test-results /tmp/npm-cache \
  && chown -R node:node /workspace /tmp/npm-cache
USER node
CMD ["npm", "run", "test"]

FROM dependencies AS build
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS production
ARG APP_VERSION=1.0.0-v2.0.0-dev
ARG VCS_REF=local
LABEL org.opencontainers.image.title="Infrastructure as Code Operation Center V2" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.revision="${VCS_REF}"
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/apps/bff ./apps/bff
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/.artifacts/v2-web ./web
RUN mkdir -p /var/lib/iacoc-v2 /run/iacoc-secrets
USER node
EXPOSE 4100
CMD ["node", "--import", "tsx", "apps/bff/src/server.ts"]
