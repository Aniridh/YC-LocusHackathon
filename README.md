# Agent-Native Data Quests

A hackathon project demonstrating agent-native, privacy-preserving data quests where buyers pay for validated predicates instead of raw data.

## Architecture

- **Backend**: Node.js + TypeScript + Express
- **Frontend**: React + TypeScript + Vite
- **Database**: PostgreSQL with Prisma ORM
- **OCR**: Google Vision API or AWS Textract (with fixture fallback)
- **Blockchain**: ethers.js/viem (DEMO_MODE toggle)
- **Locus**: Adapter pattern (stub → real SDK swap)
- **Job Queue**: Database-backed (`jobs` table with `FOR UPDATE SKIP LOCKED`)

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Google Cloud Vision API key (or AWS Textract credentials)

### Backend Setup

```bash
cd BackEnd
npm install

# Copy .env.example to .env and configure
cp .env.example .env

# Set up database
npx prisma migrate dev

# Seed database
npm run seed

# Start server
npm run dev
```

### Frontend Setup

```bash
cd FrontEnd
npm install
npm run dev
```

## Environment Variables

See `BackEnd/.env.example` for all required variables:

- `DATABASE_URL`: PostgreSQL connection string
- `DEMO_MODE`: Set to `true` for demo (uses mock blockchain)
- `GOOGLE_CLOUD_PROJECT_ID`: For OCR (or use AWS credentials)
- `ADMIN_API_KEY`: For admin endpoints

## Demo Mode

When `DEMO_MODE=true`:
- Payouts generate deterministic fake transaction hashes
- OCR falls back to pre-baked fixtures
- No real blockchain transactions

## API Endpoints

- `POST /api/submissions` - Create submission (async)
- `GET /api/submissions/:id/status` - Poll submission status
- `GET /api/quests` - List active quests
- `GET /api/quests/:id/dashboard` - Get quest dashboard
- `GET /api/payouts/audits/:payout_id` - Get audit trail
- `GET /api/queue/stats` - Get queue statistics
- `GET /healthz` - Health check

## Admin Endpoints

- `POST /api/admin/payouts/:id/retry` - Retry failed payout
- `POST /api/admin/submissions/:id/force-approve` - Force approve (DEMO_MODE only)
- `GET /api/debug/:submission_id` - Full debug trace

## Scripts

- `npm run seed` - Seed database with demo data
- `npm run reset-demo` - Reset database and re-seed
- `npm run preprocess-receipts` - Pre-process receipt images for fixtures

## Known Limitations

- Device fingerprinting: Basic (FingerprintJS + IP /24), easily spoofed
- Age verification: Self-attested only
- Fraud detection: Hackathon-level (simple heuristics, not ML)
- Blockchain: DEMO_MODE for demo (real Base Sepolia integration documented)
- Locus: Adapter stub (real SDK integration pattern shown, 1-file swap)
- Image redaction: Basic (manual regions, not ML-based)
- Justification quality: Heuristics with scoring (not blocking in demo)

These are architectural hooks for production, not blockers for demo.
