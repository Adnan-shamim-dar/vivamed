#!/bin/bash

cd /c/Users/rambe/Desktop/vivamed

echo "Starting server on port 7778..."
PORT=7778 node server.js > server-test-7778.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

echo "Waiting 8 seconds for server to start..."
sleep 8

echo "Testing /health endpoint..."
curl -s http://localhost:7778/health

echo -e "\n\nTest 1: POST /mcq-question"
curl -s -X POST http://localhost:7778/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"library-test-final","difficulty":"medium"}' > test-response-1.json
cat test-response-1.json

echo -e "\n\nTest 2: Second POST request"
curl -s -X POST http://localhost:7778/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"library-test-final","difficulty":"medium"}' > test-response-2.json
cat test-response-2.json

echo -e "\n\nTest 3: Third POST request"
curl -s -X POST http://localhost:7778/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"library-test-final","difficulty":"medium"}' > test-response-3.json
cat test-response-3.json

echo -e "\n\nTest 4: Fourth POST request"
curl -s -X POST http://localhost:7778/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"library-test-final","difficulty":"medium"}' > test-response-4.json
cat test-response-4.json

echo -e "\n\nCleaning up..."
kill $SERVER_PID 2>/dev/null
sleep 1

echo "Tests complete."
