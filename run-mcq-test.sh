#!/bin/bash
cd /c/Users/rambe/Desktop/vivamed

# Kill any running node servers
echo "Killing old processes..."
pkill -f "node server.js" 2>/dev/null || true
sleep 2

# Start server on port 7778
echo "Starting server on port 7778..."
PORT=7778 timeout 60 node server.js > mcq-test-server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to start
echo "Waiting 8 seconds for server to start..."
sleep 8

# Check if server is running
echo "Testing server health..."
curl -s http://localhost:7778/health | head -c 200
echo ""

# Make test requests
echo ""
echo "========================================"
echo "TEST 1: Request 1"
echo "========================================"
curl -s -X POST http://localhost:7778/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"library-test-final","difficulty":"medium"}' > /tmp/test1.json
cat /tmp/test1.json | jq '.' 2>/dev/null || cat /tmp/test1.json
echo ""

echo "========================================"
echo "TEST 2: Request 2"
echo "========================================"
curl -s -X POST http://localhost:7778/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"library-test-final","difficulty":"medium"}' > /tmp/test2.json
cat /tmp/test2.json | jq '.' 2>/dev/null || cat /tmp/test2.json
echo ""

echo "========================================"
echo "TEST 3: Request 3"
echo "========================================"
curl -s -X POST http://localhost:7778/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"library-test-final","difficulty":"medium"}' > /tmp/test3.json
cat /tmp/test3.json | jq '.' 2>/dev/null || cat /tmp/test3.json
echo ""

echo "========================================"
echo "TEST 4: Request 4"
echo "========================================"
curl -s -X POST http://localhost:7778/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"library-test-final","difficulty":"medium"}' > /tmp/test4.json
cat /tmp/test4.json | jq '.' 2>/dev/null || cat /tmp/test4.json
echo ""

# Clean up
echo "Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
sleep 1

echo "Done! Test files saved to /tmp/test[1-4].json"
