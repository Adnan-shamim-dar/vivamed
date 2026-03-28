FROM node:20-slim

WORKDIR /app

# Copy only package files first
COPY package.json ./

# Install dependencies (no native modules to compile)
RUN npm install

# Copy rest of app
COPY . .

# Create directories
RUN mkdir -p data uploads

EXPOSE 8080

CMD ["node", "server.js"]
