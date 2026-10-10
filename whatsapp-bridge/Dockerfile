# ── Dependencies stage ────────────────────────────────────────────────────────────────────────────────
FROM node:25-alpine AS deps
WORKDIR /app

# Some Baileys dependencies are fetched from git
RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ── Runtime stage ──────────────────────────────────────────────────────────────────────────────
FROM node:25-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY index.js ./

# Run as non-root
RUN addgroup -S wauser && adduser -S -G wauser wauser \
    && mkdir -p /app/sessions \
    && chown -R wauser:wauser /app

USER wauser

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
