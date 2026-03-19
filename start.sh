#!/bin/bash

# AI Medical Viva Trainer - Unix Launch Script
echo ""
echo "🏥 Starting AI Medical Viva Trainer..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Check if data directory exists
if [ ! -d "data" ]; then
  echo "📁 Creating data directory..."
  mkdir -p data
fi

echo ""
echo "✅ Starting server on http://localhost:5001"
echo "📝 Press Ctrl+C to stop"
echo ""

npm start
