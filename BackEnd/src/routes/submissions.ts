import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { createApiError, ErrorCode, generateRequestId } from '../utils/errors';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/raw/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/raw');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * POST /api/submissions
 * Create a new submission (async)
 */
router.post('/', upload.single('receipt_image'), async (req, res) => {
  const requestId = generateRequestId();

  try {
    const { quest_id, wallet, zip_prefix, justification_text } = req.body;

    if (!quest_id || !wallet || !zip_prefix || !justification_text) {
      return res.status(400).json(
        createApiError(ErrorCode.INVALID_INPUT, requestId, {
          missing: ['quest_id', 'wallet', 'zip_prefix', 'justification_text'].filter(
            field => !req.body[field]
          ),
        })
      );
    }

    if (!req.file) {
      return res.status(400).json(
        createApiError(ErrorCode.INVALID_INPUT, requestId, {
          message: 'receipt_image is required',
        })
      );
    }

    // Verify quest exists
    const quest = await prisma.quest.findUnique({
      where: { id: quest_id },
    });

    if (!quest) {
      return res.status(404).json(
        createApiError(ErrorCode.QUEST_NOT_FOUND, requestId)
      );
    }

    // Read image file
    const imageBuffer = fs.readFileSync(req.file.path);
    const contentHash = createHash('sha256').update(imageBuffer).digest('hex');

    // Generate device fingerprint (simplified)
    const userAgent = req.get('user-agent') || '';
    const ip = req.ip || req.socket.remoteAddress || '';
    
    // Handle both IPv4 and IPv6 addresses
    let ipPrefix: string;
    if (ip.includes(':')) {
      // IPv6: use first 64 bits (first 4 groups) for /64 prefix
      const ipv6Parts = ip.split(':');
      ipPrefix = ipv6Parts.slice(0, 4).join(':');
    } else {
      // IPv4: use first 3 octets for /24 prefix
      ipPrefix = ip.split('.').slice(0, 3).join('.');
    }
    
    const deviceFingerprint = createHash('sha256')
      .update(`${userAgent}|${ipPrefix}|${wallet}`)
      .digest('hex');

    // Find or create contributor
    let contributor = await prisma.contributor.findUnique({
      where: { wallet },
    });

    if (!contributor) {
      contributor = await prisma.contributor.create({
        data: {
          wallet,
          device_fingerprint: deviceFingerprint,
        },
      });
    }

    // Create submission
    const submission = await prisma.submission.create({
      data: {
        quest_id,
        contributor_id: contributor.id,
        wallet,
        zip_prefix,
        justification_text,
        receipt_url: `/uploads/raw/${req.file.filename}`,
        content_hash: contentHash,
        device_fingerprint: deviceFingerprint,
        status: 'PENDING',
      },
    });

    // Create verification job
    await prisma.job.create({
      data: {
        type: 'VERIFY',
        entity_id: submission.id,
        status: 'QUEUED',
      },
    });

    res.status(201).json({
      submission_id: submission.id,
      status: 'PENDING',
      message: 'Submission created and queued for verification',
      requestId,
    });
  } catch (error) {
    console.error('Submission creation error:', error);
    res.status(500).json(
      createApiError(ErrorCode.INTERNAL_ERROR, requestId, {
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
});

/**
 * GET /api/submissions/:id/status
 * Get submission status (for polling)
 */
router.get('/:id/status', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const { id } = req.params;

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        verification_result: true,
        payout: true,
      },
    });

    if (!submission) {
      return res.status(404).json(
        createApiError(ErrorCode.SUBMISSION_NOT_FOUND, requestId)
      );
    }

    const response: any = {
      submission_id: submission.id,
      status: submission.status,
      requestId,
    };

    if (submission.verification_result) {
      response.decision_trace = submission.verification_result.trace;
      if (submission.status === 'REJECTED') {
        response.error_message = submission.verification_result.reasons.join('; ');
      }
    }

    if (submission.payout) {
      response.tx_hash = submission.payout.tx_hash;
      response.payout_status = submission.payout.status;
    }

    res.json(response);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json(
      createApiError(ErrorCode.INTERNAL_ERROR, requestId)
    );
  }
});

export default router;

