# Waddle Aboard API. Build context: repository root.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --workspace api --include-workspace-root=false --omit=dev --ignore-scripts \
 && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/db/migrations \
    SEEDS_DIR=/app/db/seeds
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY api/package.json api/
COPY api/src api/src
COPY db db
USER node
EXPOSE 3000
CMD ["node", "api/src/server.js"]
