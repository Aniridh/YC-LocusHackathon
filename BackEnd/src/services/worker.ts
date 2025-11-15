import { JobType, JobStatus } from '@prisma/client';
import prisma from '../db/client';
import { verifierAgent } from '../agents/verifier';
import { fraudGuardAgent } from '../agents/fraud-guard';

const WORKER_INTERVAL_MS = 750; // 500-1000ms range
let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

/**
 * Claim next job using FOR UPDATE SKIP LOCKED
 * Returns job ID or null if no jobs available
 */
async function claimNextJob(): Promise<{ id: string; type: string; entity_id: string } | null> {
  // Use raw SQL for FOR UPDATE SKIP LOCKED (Prisma doesn't support this directly)
  const result = await prisma.$queryRaw<Array<{ id: string; type: string; entity_id: string }>>`
    SELECT id, type, entity_id
    FROM "Job"
    WHERE status = 'QUEUED'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;

  if (result.length === 0) {
    return null;
  }

  const job = result[0];

  // Update job to PROCESSING
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
    },
  });

  return job;
}

/**
 * Process verification job pipeline:
 * Verifier → FraudGuard → write verification_results → if APPROVE, enqueue PAYOUT job
 */
async function processVerificationJob(jobId: string, submissionId: string): Promise<void> {
  try {
    // Call Verifier Agent
    const verifierResult = await verifierAgent({ submissionId });

    // Call Fraud Guard Agent
    const fraudResult = await fraudGuardAgent({ submissionId, verifierResult });

    // Combine results
    const allPredicatesPass = verifierResult.rules_fired.every((r) => r.ok === true);
    const riskAcceptable = fraudResult.riskScore < 0.5;
    const decision = allPredicatesPass && riskAcceptable ? 'APPROVE' : 'REJECT';

    // Write verification results
    await prisma.verificationResult.upsert({
      where: { submission_id: submissionId },
      update: {
        decision,
        trace: {
          verifier: verifierResult,
          fraud_guard: fraudResult,
        },
        risk_score: fraudResult.riskScore,
        reasons: fraudResult.flags,
      },
      create: {
        submission_id: submissionId,
        decision,
        trace: {
          verifier: verifierResult,
          fraud_guard: fraudResult,
        },
        risk_score: fraudResult.riskScore,
        reasons: fraudResult.flags,
      },
    });

    // Update submission status
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      },
    });

    // If approved, enqueue PAYOUT job
    if (decision === 'APPROVE') {
      await prisma.job.create({
        data: {
          type: 'PAYOUT',
          entity_id: submissionId,
          status: 'QUEUED',
        },
      });
    }

    // Job completion is handled in processJob
  } catch (error) {
    // Also update submission status to FAILED on verification failure
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'FAILED',
      },
    });

    throw error;
  }
}

/**
 * Process payout job
 */
async function processPayoutJob(jobId: string, submissionId: string): Promise<void> {
  const { payoutAgent } = await import('../agents/payout');
  await payoutAgent({ submissionId });
  // Job completion is handled in processJob
}

/**
 * Process a single job
 */
async function processJob(jobId: string, jobType: JobType, entityId: string): Promise<void> {
  try {
    switch (jobType) {
      case 'VERIFY':
        await processVerificationJob(jobId, entityId);
        break;
      case 'PAYOUT':
        await processPayoutJob(jobId, entityId);
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    // Mark job as completed on success
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
      },
    });
  } catch (error) {
    // On failure: increment attempts, set FAILED with last_error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        last_error: errorMessage,
      },
    });

    throw error;
  }
}

/**
 * Worker loop: claim and process one job
 */
async function workerTick(): Promise<void> {
  if (isRunning) {
    return; // Skip if already processing
  }

  try {
    isRunning = true;
    const job = await claimNextJob();

    if (!job) {
      // No jobs available, wait for next tick
      return;
    }

    await processJob(job.id, job.type, job.entity_id);
  } catch (error) {
    console.error('Worker error:', error);
    // Error already handled in processJob, just log here
  } finally {
    isRunning = false;
  }
}

/**
 * Start the worker loop
 */
export function startWorker(): void {
  if (workerInterval) {
    console.log('Worker already running');
    return;
  }

  console.log('Starting worker...');
  
  workerInterval = setInterval(() => {
    workerTick().catch((error) => {
      console.error('Unhandled worker error:', error);
    });
  }, WORKER_INTERVAL_MS);

  // Process immediately on start
  workerTick().catch((error) => {
    console.error('Initial worker tick error:', error);
  });
}

/**
 * Stop the worker loop
 */
export function stopWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('Worker stopped');
  }
}
