# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM dependencies AS development
ENV NODE_ENV=development HOST=0.0.0.0 PORT=5173 NPM_CONFIG_CACHE=/tmp/npm-cache
COPY . .
RUN mkdir -p /app/.svelte-kit /app/.artifacts /app/test-results /var/lib/iacoc /run/iacoc-secrets /ms-playwright && chown -R node:node /app /ms-playwright /var/lib/iacoc /run/iacoc-secrets
USER node
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM dependencies AS test
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NPM_CONFIG_CACHE=/tmp/npm-cache
RUN apt-get update && apt-get install -y --no-install-recommends openssl && npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright && apt-get clean
COPY . .
RUN mkdir -p /app/.svelte-kit /app/.artifacts /app/test-results /tmp/npm-cache && chown -R node:node /app /tmp/npm-cache
USER node
CMD ["sh", "-c", "npm run lint && npm run check && npm test && npm run build && node scripts/verify-production.mjs .artifacts/build && npm run test:e2e"]

FROM dependencies AS build
COPY . .
RUN npm run build && node scripts/verify-production.mjs .artifacts/build && npm prune --omit=dev --ignore-scripts

FROM ${NODE_IMAGE} AS production
ARG APP_VERSION=0.6.3-rc.2
ARG VCS_REF=local
LABEL org.opencontainers.image.title="IaCoC" org.opencontainers.image.version="${APP_VERSION}" org.opencontainers.image.revision="${VCS_REF}"
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.artifacts/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/src/lib/server/security ./src/lib/server/security
COPY --from=build --chown=node:node /app/src/lib/types ./src/lib/types
COPY --from=build --chown=node:node /app/scripts/security-admin.mjs /app/scripts/bootstrap-admin.mjs /app/scripts/start-server.mjs ./scripts/
RUN mkdir -p /var/lib/iacoc /run/iacoc-secrets && chown node:node /var/lib/iacoc /run/iacoc-secrets && chmod 700 /var/lib/iacoc /run/iacoc-secrets
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "--experimental-strip-types", "scripts/start-server.mjs", "build"]
