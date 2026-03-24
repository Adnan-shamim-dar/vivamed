#!/bin/bash
# Kill all node processes and restart server fresh

echo "🛑 Stopping all Node.js processes..."

# Try multiple methods for Windows compatibility
taskkill /F /IM node.exe /T 2>/dev/null || true
wmic process where name="node.exe" delete /nointeractive 2>/dev/null || true

# Wait for port to free up
echo "⏳ Waiting for port 9997 to free up..."
for i in {1..15}; do
  if ! netstat -ano 2>/dev/null | grep -q ":9997"; then
    echo "✅ Port 9997 is free"
    break
  fi
  sleep 1
done

echo "🚀 Starting fresh server..."
cd "$(dirname "$0")/.."
npm start

if [ $? -ne 0 ]; then
  echo "❌ Server failed to start"
  exit 1
fi
