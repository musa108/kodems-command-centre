# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --include-workspace-root
COPY apps/api apps/api
RUN npm -w apps/api run build && npm prune --omit=dev --workspace apps/api

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN useradd -r -u 10001 kodems && mkdir -p /app/uploads && chown kodems /app/uploads
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/scripts ./scripts
COPY --from=build /repo/apps/api/package.json ./
USER kodems
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD node -e "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations are a separate, explicit step: `docker compose run --rm api node scripts/migrate.js` (see docs/DEPLOYMENT.md)
CMD ["node", "dist/main.js"]
