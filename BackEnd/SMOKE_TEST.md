# Backend Smoke Test Guide

## Prerequisites

1. **Start Docker and Postgres:**
   ```bash
   docker compose up -d
   ```

2. **Run migrations:**
   ```bash
   cd BackEnd
   npx prisma migrate dev
   npx prisma generate
   ```

3. **Seed the database:**
   ```bash
   npm run seed
   ```

4. **Start the server:**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:4000` (or the PORT in your `.env`).

## Smoke Test Steps

### 1. Health Check
```bash
curl http://localhost:4000/healthz
```
**Expected:** HTTP 200 with database status

### 2. Get Demo Quest
```bash
curl http://localhost:4000/api/quests
```
**Expected:** HTTP 200 with demo quest (Petco/Chewy) in the response

### 3. Upload a Receipt

First, get the quest ID from step 2, then:

```bash
curl -X POST http://localhost:4000/api/submissions \
  -F "quest_id=<QUEST_ID_FROM_STEP_2>" \
  -F "wallet=0x1234567890123456789012345678901234567890" \
  -F "zip_prefix=94102" \
  -F "justification_text=Smoke test submission" \
  -F "receipt_image=@/path/to/receipt.jpg"
```

**Expected:** HTTP 200/201 with `submission_id` in response

**Note:** If you have receipt images in `BackEnd/seed/receipts/`, you can use one of those:
```bash
curl -X POST http://localhost:4000/api/submissions \
  -F "quest_id=<QUEST_ID>" \
  -F "wallet=0x1234567890123456789012345678901234567890" \
  -F "zip_prefix=94102" \
  -F "justification_text=Test" \
  -F "receipt_image=@seed/receipts/receipt1.jpg"
```

### 4. Poll Submission Status

Replace `<SUBMISSION_ID>` with the ID from step 3:

```bash
curl http://localhost:4000/api/submissions/<SUBMISSION_ID>/status
```

**Watch for status progression:**
- `QUEUED` → `PROCESSING` → `APPROVED` → `PAID`

**Poll every 2-3 seconds:**
```bash
watch -n 2 'curl -s http://localhost:4000/api/submissions/<SUBMISSION_ID>/status | jq'
```

Or use a simple loop:
```bash
for i in {1..30}; do
  echo "Attempt $i:"
  curl -s http://localhost:4000/api/submissions/<SUBMISSION_ID>/status | jq '.status, .tx_hash, .payout_id'
  sleep 2
done
```

### 5. Check Audit Trail

Once status is `PAID`, get the `payout_id` from the status response, then:

```bash
curl http://localhost:4000/api/audits/<PAYOUT_ID>
```

**Expected:** HTTP 200 with full audit record including:
- Payout details (amount, tx_hash, status)
- Decision trace (verifier + fraud_guard results)
- Audit events (payout agent actions)

## Automated Test Script

You can also use the automated script:

```bash
cd BackEnd
./scripts/smoke-test.sh
```

Or with a custom base URL:
```bash
BASE_URL=http://localhost:4000 ./scripts/smoke-test.sh
```

## Troubleshooting

- **Database connection error:** Make sure Docker is running and Postgres is up
- **No quests found:** Run `npm run seed` to create demo data
- **Submission stuck in QUEUED:** Check that the worker is running (it starts automatically with the server)
- **Status not progressing:** Check server logs for errors

