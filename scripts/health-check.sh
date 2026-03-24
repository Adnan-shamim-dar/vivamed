#!/bin/bash
# Verify server is fully ready with new code

SERVER="http://localhost:9997"
TIMEOUT=30
ELAPSED=0

echo "🔍 Health checking server at $SERVER..."

# Wait for basic health
while [ $ELAPSED -lt $TIMEOUT ]; do
  HEALTH=$(curl -s "$SERVER/health" 2>/dev/null | grep -o '"status":"[^"]*"')
  if [ -n "$HEALTH" ]; then
    echo "✅ Server responds to /health"
    break
  fi
  ELAPSED=$((ELAPSED + 1))
  sleep 1
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "❌ Server did not start within $TIMEOUT seconds"
  exit 1
fi

# Verify code version endpoint exists and Adaptive Learning loaded
echo "📋 Checking code version..."
CODE_VERSION=$(curl -s "$SERVER/api/dev/code-version" 2>/dev/null)

if echo "$CODE_VERSION" | grep -q '"codeHash"'; then
  HASH=$(echo "$CODE_VERSION" | grep -o '"codeHash":"[^"]*"' | cut -d'"' -f4)
  echo "✅ Code version verified (hash: $HASH)"
else
  echo "❌ Code version endpoint not found - server may be stale"
  exit 1
fi

if echo "$CODE_VERSION" | grep -q '"adaptiveLoadingReady":true'; then
  echo "✅ Adaptive Learning system verified - topics feature active"
else
  echo "⚠️ Adaptive Learning not loaded - this may be old code"
  exit 1
fi

# Verify MCQ endpoint returns topics (adaptive learning feature)
echo "📋 Checking MCQ endpoint..."
MCQ=$(curl -s -X POST "$SERVER/mcq-question" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"health_check_'"$(date +%s)"'","fileId":null,"difficulty":"medium"}' 2>/dev/null)

if echo "$MCQ" | grep -q '"topic"'; then
  TOPIC=$(echo "$MCQ" | grep -o '"topic":"[^"]*"' | cut -d'"' -f4)
  echo "✅ MCQ endpoint with adaptive topics working (topic: $TOPIC)"
else
  echo "❌ MCQ endpoint not returning topics - features not deployed"
  exit 1
fi

echo ""
echo "✅ ALL HEALTH CHECKS PASSED ✅"
echo "Server is fully ready with latest code!"
echo ""
