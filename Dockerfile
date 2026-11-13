# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=4173

# Copy package files (if any) or project structure
COPY package*.json ./

# Install production dependencies if package.json exists
RUN if [ -f package.json ]; then npm install --omit=dev; fi

# Copy application server and static assets
COPY server/ ./server/
COPY site/ ./site/

# Create persistent data directory for SQLite
RUN mkdir -p /app/server/data

# Expose server port
EXPOSE 4173

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4173/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the Node.js full-stack server
CMD ["node", "server/server.js"]
