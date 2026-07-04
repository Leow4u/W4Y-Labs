# Casca fina Work4You (Next.js standalone) para Cloud Run.
# Multi-stage: deps → build → runner mínimo (sem node_modules completos).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Páginas dinâmicas (force-dynamic) não tocam o banco no build — o registry
# só é acessado em runtime via DATABASE_URL (Secret Manager).
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# usuário não-root
RUN addgroup -S w4y && adduser -S w4y -G w4y
COPY --from=build --chown=w4y:w4y /app/.next/standalone ./
COPY --from=build --chown=w4y:w4y /app/.next/static ./.next/static
COPY --from=build --chown=w4y:w4y /app/public ./public
USER w4y
# Cloud Run injeta PORT; o server.js standalone respeita PORT/HOSTNAME.
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
