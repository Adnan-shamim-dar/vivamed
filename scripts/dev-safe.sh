#!/bin/bash
# Safe development wrapper: Kill old processes, verify port free, then start dev server

set -e

PORT=9997
MAX_WAIT=20
ELAPSED=0

echo "🧹 Starting safe dev server..."
echo ""

# Step 1: Kill ALL Node processes
echo "🛑 Step 1: Killing all Node.js processes..."
pkill -f "node" 2>/dev/null || true
pkill -f "nodemon" 2>/dev/null || true
sleep 2

# Step 2: Force kill any stragglers holding the port
echo "🔓 Step 2: Forcing port $PORT to release..."
while netstat -ano 2>/dev/null | grep -q ":$PORT"; do
  PIDs=$(netstat -ano 2>/dev/null | grep ":$PORT" | awk '{print $NF}' | sort -u)
  for PID in $PIDs; do
    if [ -n "$PID" ] && [ "$PID" != "PID" ]; then
      kill -9 $PID 2>/dev/null || true
    fi
  done
  sleep 1
  ELAPSED=$((ELAPSED + 1))

  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "⚠️ Warning: Port $PORT still in use after $MAX_WAIT seconds"
    break
  fi
done

# Step 3: Verify port is free
sleep 2
if netstat -ano 2>/dev/null | grep -q ":$PORT"; then
  echo "❌ ERROR: Port $PORT is still in use!"
  echo "Try: lsof -i :$PORT (on Mac/Linux) or netstat -ano | grep $PORT (on Windows)"
  exit 1
fi
echo "✅ Port $PORT is now free"
echo ""

# Step 4: Start dev server
echo "🚀 Step 4: Starting dev server with nodemon..."
cd "$(dirname "$0")/.."
npm run dev
