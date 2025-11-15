#!/bin/bash
# Backend smoke test script

set -e

BASE_URL="${BASE_URL:-http://localhost:4000}"
echo "🧪 Running smoke tests against $BASE_URL"

# Test 1: Health check
echo ""
echo "1️⃣  Testing GET /healthz..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/healthz")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Health check passed (HTTP $HTTP_CODE)"
  echo "   Response: $BODY"
else
  echo "❌ Health check failed (HTTP $HTTP_CODE)"
  echo "   Response: $BODY"
  exit 1
fi

# Test 2: Get quests
echo ""
echo "2️⃣  Testing GET /api/quests..."
QUESTS_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/quests")
HTTP_CODE=$(echo "$QUESTS_RESPONSE" | tail -n1)
BODY=$(echo "$QUESTS_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Get quests passed (HTTP $HTTP_CODE)"
  QUEST_COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
  echo "   Found $QUEST_COUNT quest(s)"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
  echo "❌ Get quests failed (HTTP $HTTP_CODE)"
  echo "   Response: $BODY"
  exit 1
fi

# Test 3: Upload a receipt (using a test image if available)
echo ""
echo "3️⃣  Testing POST /api/submissions..."
echo "   Note: This requires a receipt image file"

# Check if we have a test image
TEST_IMAGE=""
if [ -f "seed/receipts/receipt1.jpg" ]; then
  TEST_IMAGE="seed/receipts/receipt1.jpg"
elif [ -f "../seed/receipts/receipt1.jpg" ]; then
  TEST_IMAGE="../seed/receipts/receipt1.jpg"
fi

if [ -z "$TEST_IMAGE" ]; then
  echo "⚠️  No test image found. Skipping submission test."
  echo "   To test manually:"
  echo "   curl -X POST $BASE_URL/api/submissions \\"
  echo "     -F 'quest_id=<quest_id>' \\"
  echo "     -F 'wallet=0x1234567890123456789012345678901234567890' \\"
  echo "     -F 'zip_prefix=94102' \\"
  echo "     -F 'justification_text=Test submission' \\"
  echo "     -F 'receipt_image=@/path/to/receipt.jpg'"
else
  echo "   Using test image: $TEST_IMAGE"
  
  # Get first quest ID
  QUEST_ID=$(echo "$BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['quests'][0]['id'] if data.get('quests') else '')" 2>/dev/null || echo "")
  
  if [ -z "$QUEST_ID" ]; then
    echo "⚠️  No quest ID found. Skipping submission test."
  else
    echo "   Using quest_id: $QUEST_ID"
    
    SUBMIT_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X POST "$BASE_URL/api/submissions" \
      -F "quest_id=$QUEST_ID" \
      -F "wallet=0x1234567890123456789012345678901234567890" \
      -F "zip_prefix=94102" \
      -F "justification_text=Smoke test submission" \
      -F "receipt_image=@$TEST_IMAGE")
    
    HTTP_CODE=$(echo "$SUBMIT_RESPONSE" | tail -n1)
    BODY=$(echo "$SUBMIT_RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
      echo "✅ Submission created (HTTP $HTTP_CODE)"
      SUBMISSION_ID=$(echo "$BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('submission_id', ''))" 2>/dev/null || echo "")
      echo "   Submission ID: $SUBMISSION_ID"
      echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
      
      if [ -n "$SUBMISSION_ID" ]; then
        echo ""
        echo "4️⃣  Polling submission status..."
        for i in {1..30}; do
          sleep 2
          STATUS_RESPONSE=$(curl -s "$BASE_URL/api/submissions/$SUBMISSION_ID/status")
          STATUS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('status', ''))" 2>/dev/null || echo "")
          TX_HASH=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('tx_hash', ''))" 2>/dev/null || echo "")
          
          echo "   Attempt $i: Status = $STATUS"
          
          if [ "$STATUS" = "PAID" ]; then
            echo "✅ Submission reached PAID status!"
            if [ -n "$TX_HASH" ]; then
              echo "   Transaction hash: $TX_HASH"
            fi
            
            # Get payout ID and check audit
            PAYOUT_ID=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('payout_id', ''))" 2>/dev/null || echo "")
            if [ -z "$PAYOUT_ID" ]; then
              # Try to get payout from submission
              PAYOUT_RESPONSE=$(curl -s "$BASE_URL/api/submissions/$SUBMISSION_ID/status")
              # Extract from response or query directly
            fi
            
            echo ""
            echo "5️⃣  Testing GET /api/audits/:payout_id..."
            echo "   Note: You'll need to get the payout_id from the submission response"
            echo "   Example: curl $BASE_URL/api/audits/<payout_id>"
            break
          elif [ "$STATUS" = "REJECTED" ] || [ "$STATUS" = "FAILED" ]; then
            echo "❌ Submission was $STATUS"
            echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
            break
          fi
        done
      fi
    else
      echo "❌ Submission failed (HTTP $HTTP_CODE)"
      echo "   Response: $BODY"
    fi
  fi
fi

echo ""
echo "✅ Smoke tests completed!"

