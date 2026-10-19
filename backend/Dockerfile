# Made By Eng Nayer Nader
FROM node:20-alpine

ENV NODE_ENV=production STATIC_SITE_ROOT=/app/public
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/ ./
COPY public/ /app/public/

RUN addgroup -S clounge && adduser -S clounge -G clounge && chown -R clounge:clounge /app
USER clounge

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
