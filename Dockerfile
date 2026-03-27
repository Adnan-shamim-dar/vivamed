FROM node:22-slim

WORKDIR /app

# Install build tools for compiling native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies fresh (builds sqlite3 for Linux)
RUN npm install --only=production

# Copy app
COPY . .

# Create data directory
RUN mkdir -p data uploads

# Expose port
EXPOSE 5555

# Start server
CMD ["node", "server.js"]
