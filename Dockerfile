# ---- build: frontend + bundled server ----
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY web web
COPY server server
RUN npm run build

# ---- runtime: node + one bundled server.js + static files, no node_modules ----
FROM alpine:3.22
RUN apk add --no-cache libstdc++ \
 && addgroup -g 1000 node && adduser -u 1000 -G node -s /sbin/nologin -D node \
 && mkdir -p /data && chown node:node /data
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /src/server/dist/server.js ./server.js
COPY --from=build /src/web/dist ./public
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data STATIC_DIR=/app/public
USER node
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.js"]
