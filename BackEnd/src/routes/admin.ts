import express from 'express';
import prisma from '../db/client';
import { createApiError, ErrorCode, generateRequestId } from '../utils/errors';
import { payoutAgent } from '../agents/payout';

const router = express.Router();

// Simple admin auth (check API key)
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'demo_admin_key';

function checkAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.get('X-Admin-API-Key') || req.get('Authorization')?.replace('Bearer ', '');
  
  if (apiKey !== ADMIN_API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      requestId: generateRequestId(),
    });
  }
  
  next();
}

router.use(checkAdminAuth);

/**
 * POST /api/admin/payouts/:id/retry
 * Retry a failed payout
 */
router.post('/payouts/:id/retry', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const { id } = req.params;

    const payout = await prisma.payout.findUnique({
      where: { id },
      include: {
        submission: {
          include: {
            quest: {
              include: {
                quest_rules: true,
              },
            },
            verification_result: true,
          },
        },
      },
    });

    if (!payout) {
      return res.status(404).json(
        createApiError(ErrorCode.INVALID_INPUT, requestId, {
          message: 'Payout not found',
        })
      );
    }

    if (payout.status !== 'FAILED') {
      return res.status(400).json(
        createApiError(ErrorCode.INVALID_INPUT, requestId, {
          message: 'Payout is not in FAILED status',
        })
      );
    }

    // Retry payout
    await payoutAgent(payout.submission as any);

    res.json({
      message: 'Payout retried successfully',
      payout_id: payout.id,
      requestId,
    });
  } catch (error) {
    console.error('Payout retry error:', error);
    res.status(500).json(
      createApiError(ErrorCode.INTERNAL_ERROR, requestId, {
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
});

/**
 * POST /api/admin/submissions/:id/force-approve
 * Force approve a submission (demo safety net)
 */
router.post('/submissions/:id/force-approve', async (req, res) => {
  const requestId = generateRequestId();

  // Only allow in DEMO_MODE
  if (process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({
      error: 'Force approve only available in DEMO_MODE',
      requestId,
    });
  }

  try {
    const { id } = req.params;

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        quest: {
          include: {
            quest_rules: true,
          },
        },
      },
    });

    if (!submission) {
      return res.status(404).json(
        createApiError(ErrorCode.SUBMISSION_NOT_FOUND, requestId)
      );
    }

    // Create fake verification result
    await prisma.verificationResult.upsert({
      where: { submission_id: id },
      update: {
        decision: 'APPROVE',
        trace: {
          forced: true,
          reason: 'Admin force approve',
        },
        risk_score: 0.0,
        reasons: ['Force approved by admin'],
      },
      create: {
        submission_id: id,
        decision: 'APPROVE',
        trace: {
          forced: true,
          reason: 'Admin force approve',
        },
        risk_score: 0.0,
        reasons: ['Force approved by admin'],
      },
    });

    // Update submission status
    await prisma.submission.update({
      where: { id },
      data: { status: 'APPROVED' },
    });

    // Create payout job
    await prisma.job.create({
      data: {
        type: 'PAYOUT',
        entity_id: id,
        status: 'QUEUED',
      },
    });

    res.json({
      message: 'Submission force approved',
      submission_id: id,
      requestId,
    });
  } catch (error) {
    console.error('Force approve error:', error);
    res.status(500).json(
      createApiError(ErrorCode.INTERNAL_ERROR, requestId)
    );
  }
});

/**
 * GET /api/debug/:submission_id
 * Get full debug trace for a submission
 */
router.get('/debug/:submission_id', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const { submission_id } = req.params;

    const submission = await prisma.submission.findUnique({
      where: { id: submission_id },
      include: {
        quest: {
          include: {
            quest_rules: true,
          },
        },
        verification_result: true,
        payout: true,
      },
    });

    if (!submission) {
      return res.status(404).json(
        createApiError(ErrorCode.SUBMISSION_NOT_FOUND, requestId)
      );
    }

    // Get all related jobs
    const jobs = await prisma.job.findMany({
      where: {
        entity_id: submission_id,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    // Get audit events
    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { entity_type: 'submission', entity_id: submission_id },
          { entity_type: 'payout', entity_id: submission.payout?.id || '' },
        ],
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    res.json({
      submission: {
        id: submission.id,
        status: submission.status,
        wallet: submission.wallet,
        zip_prefix: submission.zip_prefix,
        content_hash: submission.content_hash,
        device_fingerprint: submission.device_fingerprint,
        created_at: submission.created_at,
      },
      quest: {
        id: submission.quest.id,
        name: submission.quest.name,
        rules: submission.quest.quest_rules[0]?.rules,
      },
      verification_result: submission.verification_result,
      payout: submission.payout,
      jobs: jobs.map(j => ({
        id: j.id,
        type: j.type,
        status: j.status,
        attempts: j.attempts,
        last_error: j.last_error,
        created_at: j.created_at,
        updated_at: j.updated_at,
      })),
      audit_events: auditEvents,
      requestId,
    });
  } catch (error) {
    console.error('Debug fetch error:', error);
    res.status(500).json(
      createApiError(ErrorCode.INTERNAL_ERROR, requestId)
    );
  }
});

export default router;

