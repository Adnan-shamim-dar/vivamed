#!/bin/bash

# Kill any running node servers
ps aux | grep "node server" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null

# Wait a bit
sleep 3

# Start server on port 9000
cd /c/Users/rambe/Desktop/vivamed
PORT=9000 timeout 120 node server.js > /tmp/mcq_debug.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 8

# Make MCQ request
echo "Testing MCQ endpoint..."
curl -s -X POST http://localhost:9000/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"debugtest"}' > /tmp/mcq_response.txt

# Show response
echo "MCQ Response:"
cat /tmp/mcq_response.txt | grep -o '"source":"[^"]*"'
echo ""

# Show server logs related to MCQ
echo "Server logs (MCQ-related):"
cat /tmp/mcq_debug.log | grep -E "MCQ|API key|Generic MCQ|🤖|✅|⚠️"
