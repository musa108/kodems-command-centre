# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /repo
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_SOCKET_URL=
ARG NEXT_PUBLIC_MAP_TILES
ARG NEXT_PUBLIC_MAP_ATTRIBUTION
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL NEXT_PUBLIC_MAP_TILES=$NEXT_PUBLIC_MAP_TILES NEXT_PUBLIC_MAP_ATTRIBUTION=$NEXT_PUBLIC_MAP_ATTRIBUTION NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root
COPY apps/web apps/web
RUN npm -w apps/web run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN useradd -r -u 10001 kodems
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER kodems
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
