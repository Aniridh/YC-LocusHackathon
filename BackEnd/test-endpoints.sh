#!/bin/bash
# Quick manual smoke test

BASE_URL="http://localhost:4000"

echo "🧪 Backend Smoke Test"
echo "===================="
echo ""

echo "1️⃣  Testing GET /healthz..."
curl -s "$BASE_URL/healthz" | jq '.' || curl -s "$BASE_URL/healthz"
echo ""

echo "2️⃣  Testing GET /api/quests..."
QUESTS=$(curl -s "$BASE_URL/api/quests")
echo "$QUESTS" | jq '.' || echo "$QUESTS"
QUEST_ID=$(echo "$QUESTS" | jq -r '.quests[0].id' 2>/dev/null)
echo ""
echo "Quest ID: $QUEST_ID"
echo ""

if [ -n "$QUEST_ID" ] && [ "$QUEST_ID" != "null" ]; then
  echo "3️⃣  To test submission upload, run:"
  echo "curl -X POST $BASE_URL/api/submissions \\"
  echo "  -F 'quest_id=$QUEST_ID' \\"
  echo "  -F 'wallet=0x1234567890123456789012345678901234567890' \\"
  echo "  -F 'zip_prefix=94102' \\"
  echo "  -F 'justification_text=Test' \\"
  echo "  -F 'receipt_image=@/path/to/receipt.jpg'"
  echo ""
  echo "Then poll status with:"
  echo "curl $BASE_URL/api/submissions/<SUBMISSION_ID>/status"
  echo ""
  echo "And check audit with:"
  echo "curl $BASE_URL/api/audits/<PAYOUT_ID>"
else
  echo "⚠️  No quests found. Run 'npm run seed' first."
fi
