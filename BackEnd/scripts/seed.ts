import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Upsert buyer (deterministic ID)
  const buyer = await prisma.buyer.upsert({
    where: { id: 'buyer_demo' },
    update: {},
    create: {
      id: 'buyer_demo',
      org_name: 'Demo Startup',
      contact_email: 'demo@startup.com',
      api_key: randomBytes(32).toString('hex'),
    },
  });
  console.log('✅ Buyer created:', buyer.id);

  // 2. Upsert quest (deterministic ID)
  const questRules = {
    quest_id: 'q_demo_petco',
    eligibility: [
      { field: 'merchant', op: 'in', value: ['Chewy', 'Petco', 'PETCO Animal Supplies'] },
      { field: 'receipt_age_days', op: '<=', value: 30 },
      { field: 'amount', op: '<=', value: 50.0 },
      { field: 'zip_prefix', op: 'in', value: ['100', '112', '111'] },
      { field: 'age', op: '>=', value: 18 },
    ],
    task: {
      requires: ['justification_text'],
      questions: [
        { id: 'q1', prompt: 'What did you buy for your pet?', type: 'free_text' },
      ],
    },
    payout: { currency: 'USDC', amount: 10.0 },
    locus_policy: {
      max_per_payout: 50.0,
      max_per_day: 500.0,
      vendor_allow_list: ['Chewy', 'Petco'],
      require_justification: true,
      velocity: { max_approvals_per_device_per_day: 3 },
    },
  };

  const quest = await prisma.quest.upsert({
    where: { id: 'q_demo_petco' },
    update: {},
    create: {
      id: 'q_demo_petco',
      buyer_id: buyer.id,
      name: 'Pet Owner Quest - NYC',
      status: 'ACTIVE',
      currency: 'USDC',
      unit_amount: 10.0,
      budget_total: 1000.0,
      budget_remaining: 1000.0,
      quest_rules: {
        create: {
          rules: questRules,
        },
      },
    },
    include: {
      quest_rules: true,
    },
  });
  console.log('✅ Quest created:', quest.id);

  // 3. Upsert test contributor wallets
  const testWallets = [
    '0x1234567890123456789012345678901234567890',
    '0x2345678901234567890123456789012345678901',
    '0x3456789012345678901234567890123456789012',
    '0x4567890123456789012345678901234567890123',
    '0x5678901234567890123456789012345678901234',
    '0x6789012345678901234567890123456789012345',
    '0x7890123456789012345678901234567890123456',
    '0x8901234567890123456789012345678901234567',
    '0x9012345678901234567890123456789012345678',
    '0xa012345678901234567890123456789012345678',
  ];

  const contributors = [];
  for (const wallet of testWallets) {
    const contributor = await prisma.contributor.upsert({
      where: { wallet },
      update: {},
      create: {
        wallet,
        email: `contributor${wallet.slice(-4)}@test.com`,
        age: 25,
        country: 'US',
        device_fingerprint: `device_${wallet.slice(-8)}`,
      },
    });
    contributors.push(contributor);
  }
  console.log(`✅ Created ${contributors.length} contributors`);

  // 4. Load pre-baked OCR fixtures
  const fixturesPath = path.join(__dirname, '../fixtures/receipts.json');
  let fixtures: Record<string, any> = {};
  
  if (fs.existsSync(fixturesPath)) {
    const fixturesData = fs.readFileSync(fixturesPath, 'utf-8');
    fixtures = JSON.parse(fixturesData);
    console.log(`✅ Loaded ${Object.keys(fixtures).length} OCR fixtures`);
  } else {
    console.log('⚠️  No fixtures file found. Run npm run preprocess-receipts first.');
  }

  // 5. Create 2 pre-approved submissions for demo (if fixtures available)
  if (Object.keys(fixtures).length > 0) {
    const fixtureKeys = Object.keys(fixtures).slice(0, 2);
    
    for (let i = 0; i < Math.min(2, fixtureKeys.length); i++) {
      const imageHash = fixtureKeys[i];
      const fixture = fixtures[imageHash];
      const contributor = contributors[i % contributors.length];
      
      // Create submission
      const submission = await prisma.submission.create({
        data: {
          quest_id: quest.id,
          contributor_id: contributor.id,
          wallet: contributor.wallet,
          zip_prefix: '100',
          justification_text: 'I bought dog food for my golden retriever. He loves the brand!',
          receipt_url: `/uploads/raw/demo_${i}.jpg`,
          content_hash: imageHash,
          device_fingerprint: contributor.device_fingerprint || 'demo_device',
          status: 'APPROVED',
        },
      });

      // Create verification result
      await prisma.verificationResult.create({
        data: {
          submission_id: submission.id,
          decision: 'APPROVE',
          trace: {
            rules_fired: [
              { field: 'merchant', ok: true, observed: fixture.merchant },
              { field: 'receipt_age_days', ok: true, observed: 9 },
              { field: 'amount', ok: true, observed: fixture.amount },
              { field: 'zip_prefix', ok: true, observed: '100' },
            ],
            risk: { duplicate: false, device_velocity: 1, score: 0.08 },
            decision: 'APPROVE',
            reason: 'All predicates satisfied, low risk',
          },
          risk_score: 0.08,
          reasons: ['All predicates satisfied'],
        },
      });

      // Create payout
      await prisma.payout.create({
        data: {
          submission_id: submission.id,
          quest_id: quest.id,
          amount: 10.0,
          currency: 'USDC',
          tx_hash: `0x${randomBytes(32).toString('hex')}`,
          status: 'COMPLETED',
          mocked: true,
        },
      });

      // Update quest budget
      await prisma.quest.update({
        where: { id: quest.id },
        data: {
          budget_remaining: {
            decrement: 10.0,
          },
        },
      });
    }
    console.log('✅ Created 2 pre-approved demo submissions');
  }

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

