FROM node:24.13-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm ci --production

# Copy source code
COPY dist ./dist
COPY templates ./templates

# Create logs directory
RUN mkdir -p logs

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "dist/index.js"]
