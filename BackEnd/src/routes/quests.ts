import express from 'express';
import prisma from '../db/client';
import { createApiError, ErrorCode, generateRequestId } from '../utils/errors';

const router = express.Router();

/**
 * POST /api/quests
 * Create a new quest
 */
router.post('/', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const { name, budget_total, unit_amount, rules } = req.body;

    if (!name || !budget_total || !unit_amount || !rules) {
      return res.status(400).json(
        createApiError(ErrorCode.INVALID_INPUT, requestId)
      );
    }

    // For demo, use hardcoded buyer
    const buyer = await prisma.buyer.findFirst({
      where: { id: 'buyer_demo' },
    });

    if (!buyer) {
      return res.status(500).json(
        createApiError(ErrorCode.INTERNAL_ERROR, requestId, {
          message: 'Demo buyer not found. Run seed script first.',
        })
      );
    }

    const quest = await prisma.quest.create({
      data: {
        buyer_id: buyer.id,
        name,
        status: 'ACTIVE',
        currency: 'USDC',
        unit_amount: parseFloat(unit_amount),
        budget_total: parseFloat(budget_total),
        budget_remaining: parseFloat(budget_total),
        quest_rules: {
          create: {
            rules,
          },
        },
      },
      include: {
        quest_rules: true,
      },
    });

    res.status(201).json({
      quest_id: quest.id,
      status: 'created',
      requestId,
    });
  } catch (error) {
    console.error('Quest creation error:', error);
    res.status(500).json(
      createApiError(ErrorCode.INTERNAL_ERROR, requestId)
    );
  }
});

/**
 * GET /api/quests/:id/dashboard
 * Get quest dashboard data
 */
router.get('/:id/dashboard', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const { id } = req.params;

    const quest = await prisma.quest.findUnique({
      where: { id },
      include: {
        quest_rules: true,
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    });

    if (!quest) {
      return res.status(404).json(
        createApiError(ErrorCode.QUEST_NOT_FOUND, requestId)
      );
    }

    // Get submission stats
    const [approved, rejected, paid] = await Promise.all([
      prisma.submission.count({
        where: { quest_id: id, status: 'APPROVED' },
      }),
      prisma.submission.count({
        where: { quest_id: id, status: 'REJECTED' },
      }),
      prisma.submission.count({
        where: { quest_id: id, status: 'PAID' },
      }),
    ]);

    // Get recent payouts
    const recentPayouts = await prisma.payout.findMany({
      where: { quest_id: id },
      orderBy: { created_at: 'desc' },
      take: 10,
      include: {
        submission: {
          select: {
            id: true,
            wallet: true,
            created_at: true,
          },
        },
      },
    });

    // Calculate total spent
    const totalSpentResult = await prisma.payout.aggregate({
      where: {
        quest_id: id,
        status: 'COMPLETED',
      },
      _sum: {
        amount: true,
      },
    });

    const totalSpent = parseFloat(totalSpentResult._sum.amount?.toString() || '0');

    res.json({
      quest_id: quest.id,
      name: quest.name,
      status: quest.status,
      budget_total: parseFloat(quest.budget_total.toString()),
      budget_remaining: parseFloat(quest.budget_remaining.toString()),
      total_spent: totalSpent,
      stats: {
        total_submissions: quest._count.submissions,
        approved,
        rejected,
        paid,
      },
      recent_payouts: recentPayouts.map(p => ({
        payout_id: p.id,
        submission_id: p.submission_id,
        amount: parseFloat(p.amount.toString()),
        tx_hash: p.tx_hash,
        mocked: p.mocked,
        created_at: p.created_at,
        wallet: p.submission.wallet,
      })),
      requestId,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json(
      createApiError(ErrorCode.INTERNAL_ERROR, requestId)
    );
  }
});

/**
 * GET /api/quests
 * List all active quests
 */
router.get('/', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const quests = await prisma.quest.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        quest_rules: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    res.json({
      quests: quests.map(q => ({
        id: q.id,
        name: q.name,
        unit_amount: parseFloat(q.unit_amount.toString()),
        currency: q.currency,
        budget_remaining: parseFloat(q.budget_remaining.toString()),
        rules: q.quest_rules[0]?.rules,
        created_at: q.created_at,
      })),
      requestId,
    });
  } catch (error) {
    console.error('Quest list error:', error);
    res.status(500).json(
      createApiError(ErrorCode.INTERNAL_ERROR, requestId)
    );
  }
});

export default router;

