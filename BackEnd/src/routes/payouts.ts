import express from 'express';
import prisma from '../db/client';
import { createApiError, ErrorCode, generateRequestId } from '../utils/errors';

const router = express.Router();

/**
 * GET /api/audits/:payout_id
 * Get full audit record for a payout
 */
router.get('/audits/:payout_id', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const { payout_id } = req.params;

    const payout = await prisma.payout.findUnique({
      where: { id: payout_id },
      include: {
        submission: {
          include: {
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

    // Get audit events
    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        entity_type: 'payout',
        entity_id: payout_id,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    res.json({
      payout_id: payout.id,
      submission_id: payout.submission_id,
      amount: parseFloat(payout.amount.toString()),
      currency: payout.currency,
      tx_hash: payout.tx_hash,
      mocked: payout.mocked,
      status: payout.status,
      created_at: payout.created_at,
      decision_trace: payout.submission.verification_result?.trace,
      audit_events: auditEvents.map(e => ({
        actor_id: e.actor_id,
        event_type: e.event_type,
        payload: e.payload,
        timestamp: e.created_at,
      })),
      requestId,
    });
  } catch (error) {
    console.error('Audit fetch error:', error);
    res.status(500).json(
      createApiError(ErrorCode.INTERNAL_ERROR, requestId)
    );
  }
});

export default router;

