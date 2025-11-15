import prisma from '../src/db/client';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Upsert buyer_demo
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

  // 2. Upsert q_demo_petco with Petco/Chewy rules JSON
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

  // Upsert quest rules separately (idempotent)
  await prisma.questRule.upsert({
    where: { quest_id: quest.id },
    update: { rules: questRules },
    create: {
      quest_id: quest.id,
      rules: questRules,
    },
  });
  
  console.log('✅ Quest created:', quest.id);

  // 3. Upsert 10 contributor wallets
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

  // 4. Ensure fixtures/receipts.json exists with 6 fixture receipts
  const fixturesPath = path.join(__dirname, '../fixtures/receipts.json');
  const fixturesDir = path.dirname(fixturesPath);
  
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  let fixtures: Record<string, { merchant: string; date: string; amount: number }> = {};
  
  if (fs.existsSync(fixturesPath)) {
    const fixturesData = fs.readFileSync(fixturesPath, 'utf-8');
    fixtures = JSON.parse(fixturesData);
    console.log(`✅ Loaded ${Object.keys(fixtures).length} OCR fixtures`);
  } else {
    // Create default fixtures if file doesn't exist
    fixtures = {
      'demo_hash_1': { merchant: 'Chewy', date: '2025-01-15', amount: 28.33 },
      'demo_hash_2': { merchant: 'Petco', date: '2025-01-20', amount: 35.50 },
      'demo_hash_3': { merchant: 'Chewy', date: '2025-01-10', amount: 42.99 },
      'demo_hash_4': { merchant: 'Petco', date: '2025-01-18', amount: 19.99 },
      'demo_hash_5': { merchant: 'Chewy', date: '2025-01-12', amount: 31.25 },
      'demo_hash_6': { merchant: 'Petco', date: '2025-01-22', amount: 27.80 },
    };
    fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2));
    console.log('✅ Created default fixtures file');
  }

  // 5. Create 2 pre-approved submissions
  if (Object.keys(fixtures).length >= 2) {
    const fixtureKeys = Object.keys(fixtures).slice(0, 2);
    
    for (let i = 0; i < 2; i++) {
      const imageHash = fixtureKeys[i];
      const fixture = fixtures[imageHash];
      const contributor = contributors[i % contributors.length];
      
      // Upsert submission (idempotent)
      const submission = await prisma.submission.upsert({
        where: { id: `demo_submission_${i}` },
        update: {
          status: 'APPROVED',
        },
        create: {
          id: `demo_submission_${i}`,
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

      // Upsert verification result
      await prisma.verificationResult.upsert({
        where: { submission_id: submission.id },
        update: {},
        create: {
          submission_id: submission.id,
          decision: 'APPROVE',
          trace: {
            verifier: {
              rules_fired: [
                { field: 'merchant', ok: true, observed: fixture.merchant },
                { field: 'receipt_age_days', ok: true, observed: 9 },
                { field: 'amount', ok: true, observed: fixture.amount },
                { field: 'zip_prefix', ok: true, observed: '100' },
              ],
              ocr_fields: fixture,
              confidence: 0.95,
            },
            fraud_guard: {
              duplicate: false,
              device_velocity: 1,
              risk_score: 0.08,
              reasons: [],
            },
            risk: { duplicate: false, device_velocity: 1, score: 0.08 },
            decision: 'APPROVE',
            reason: 'All predicates satisfied, low risk',
          },
          risk_score: 0.08,
          reasons: ['All predicates satisfied'],
        },
      });

      // Upsert payout
      await prisma.payout.upsert({
        where: { submission_id: submission.id },
        update: {},
        create: {
          submission_id: submission.id,
          quest_id: quest.id,
          amount: 10.0,
          currency: 'USDC',
          tx_hash: `0x${randomBytes(32).toString('hex')}`,
          status: 'COMPLETED',
          mocked: true,
        },
      });
    }

    // Update quest budget (only if we created new submissions)
    const existingPayouts = await prisma.payout.count({
      where: { quest_id: quest.id },
    });
    
    if (existingPayouts <= 2) {
      await prisma.quest.update({
        where: { id: quest.id },
        data: {
          budget_remaining: {
            set: 1000.0 - (existingPayouts * 10.0),
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
