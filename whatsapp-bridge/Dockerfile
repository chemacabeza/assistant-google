FROM node:20-alpine

# Install Chromium and its dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dumb-init

# Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    CHROMIUM_PATH=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY index.js ./

# Run as non-root for security
RUN addgroup -S pptruser && adduser -S -G pptruser pptruser \
    && mkdir -p /app/sessions \
    && chown -R pptruser:pptruser /app

USER pptruser

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
