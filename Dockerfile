# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Install system dependencies for Sharp and other native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs uploads uploads/optimized uploads/thumbnails

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S vintage -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R vintage:nodejs /app

# Switch to non-root user
USER vintage

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["npm", "start"]