import { PrismaClient, JobType, JobStatus } from '@prisma/client';
import { verifierAgent } from '../agents/verifier';
import { fraudGuardAgent } from '../agents/fraud-guard';
import { payoutAgent } from '../agents/payout';

const prisma = new PrismaClient();

const WORKER_INTERVAL_MS = 1000; // 1 second
let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

export async function processJob(jobId: string, jobType: JobType, entityId: string): Promise<void> {
  try {
    if (jobType === 'VERIFY') {
      await processVerificationJob(entityId);
    } else if (jobType === 'PAYOUT') {
      await processPayoutJob(entityId);
    }
  } catch (error) {
    console.error(`❌ Job ${jobId} failed:`, error);
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        last_error: error instanceof Error ? error.message : String(error),
        attempts: { increment: 1 },
      },
    });
    throw error;
  }
}

async function processVerificationJob(submissionId: string): Promise<void> {
  // Load submission
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      quest: {
        include: {
          quest_rules: true,
        },
      },
      contributor: true,
    },
  });

  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  if (submission.status !== 'PENDING' && submission.status !== 'QUEUED') {
    console.log(`Submission ${submissionId} already processed`);
    return;
  }

  // Update status to PROCESSING
  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: 'PROCESSING' },
  });

  try {
    // Call Verifier Agent
    const verifierResult = await verifierAgent(submission);

    // Call Fraud Guard Agent
    const fraudResult = await fraudGuardAgent(submission, verifierResult);

    // Combine results
    const allPredicatesPass = verifierResult.rules_fired.every((r: any) => r.ok === true);
    const riskAcceptable = fraudResult.risk_score < 0.5;
    const decision = allPredicatesPass && riskAcceptable ? 'APPROVE' : 'REJECT';

    // Store verification result
    await prisma.verificationResult.create({
      data: {
        submission_id: submissionId,
        decision,
        trace: {
          verifier: verifierResult,
          fraud_guard: fraudResult,
        },
        risk_score: fraudResult.risk_score,
        reasons: fraudResult.reasons,
      },
    });

    // Update submission status
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      },
    });

    // If approved, create payout job
    if (decision === 'APPROVE') {
      await prisma.job.create({
        data: {
          type: 'PAYOUT',
          entity_id: submissionId,
          status: 'QUEUED',
        },
      });
    }
  } catch (error) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'FAILED' },
    });
    throw error;
  }
}

async function processPayoutJob(submissionId: string): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      quest: {
        include: {
          quest_rules: true,
        },
      },
      verification_result: true,
    },
  });

  if (!submission || !submission.verification_result) {
    throw new Error(`Submission ${submissionId} or verification result not found`);
  }

  if (submission.status !== 'APPROVED') {
    console.log(`Submission ${submissionId} not approved, skipping payout`);
    return;
  }

  // Call Payout Agent
  await payoutAgent(submission);
}

async function claimNextJob(): Promise<string | null> {
  // Use FOR UPDATE SKIP LOCKED to prevent concurrent processing
  // Prisma doesn't support SKIP LOCKED directly, so we use raw SQL
  const result = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "Job"
     WHERE status = 'QUEUED'
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`
  );

  if (result.length === 0) {
    return null;
  }

  const jobId = result[0].id;

  // Update job to PROCESSING
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
    },
  });

  return jobId;
}

async function workerLoop(): Promise<void> {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const jobId = await claimNextJob();

    if (!jobId) {
      isRunning = false;
      return;
    }

    // Load job details
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      isRunning = false;
      return;
    }

    try {
      await processJob(job.id, job.type, job.entity_id);

      // Mark job as completed
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'COMPLETED' },
      });
    } catch (error) {
      // Error handling is done in processJob
      console.error(`Job ${jobId} processing error:`, error);
    }
  } catch (error) {
    console.error('Worker loop error:', error);
  } finally {
    isRunning = false;
  }
}

export function startWorker(): void {
  if (workerInterval) {
    console.log('⚠️  Worker already running');
    return;
  }

  console.log('🚀 Starting job worker...');
  workerInterval = setInterval(workerLoop, WORKER_INTERVAL_MS);
}

export function stopWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('🛑 Worker stopped');
  }
}

// Auto-start worker if this module is imported
if (require.main === module) {
  startWorker();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    stopWorker();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    stopWorker();
    process.exit(0);
  });
}

