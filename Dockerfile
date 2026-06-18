FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

# ── Etapa 2: runtime (imagen final, sin SDK de Nest) ────
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache curl \
  && addgroup -S appgroup && adduser -S appuser -G appgroup
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "dist/src/main"]