FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (Railway builds on Linux, no GLIBC issues)
RUN npm ci --only=production

# Copy app
COPY . .

# Create data directory
RUN mkdir -p data uploads

# Expose port
EXPOSE 5555

# Start server
CMD ["node", "server.js"]
