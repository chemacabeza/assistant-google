FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy pre-built node_modules (installed on host to avoid Docker OOM)
COPY node_modules ./node_modules
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
