FROM node:20-slim

WORKDIR /app

# Bust cache and install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy only package files first
COPY package.json ./

# Install dependencies - fresh build of sqlite3 for this Linux environment
RUN npm install --no-optional

# Copy rest of app
COPY . .

# Create directories
RUN mkdir -p data uploads

EXPOSE 5555

CMD ["node", "server.js"]
