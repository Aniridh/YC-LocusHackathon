import express from 'express';
import { JobStatus } from '@prisma/client';
import prisma from '../db/client';
import { generateRequestId } from '../utils/errors';

const router = express.Router();

/**
 * GET /api/queue/stats
 * Get queue statistics
 */
router.get('/stats', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const [queued, processing] = await Promise.all([
      prisma.job.count({
        where: { status: 'QUEUED' },
      }),
      prisma.job.count({
        where: { status: 'PROCESSING' },
      }),
    ]);

    res.json({
      queued,
      processing,
      requestId,
    });
  } catch (error) {
    console.error('Queue stats error:', error);
    res.status(500).json({
      error: 'Internal server error',
      requestId,
    });
  }
});

export default router;

