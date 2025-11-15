import { Submission, PayoutStatus } from '@prisma/client';
import prisma from '../db/client';
import { getLocusAdapter, PolicyViolation } from '../locus/adapter';
import { createHash } from 'crypto';
import { ethers } from 'ethers';

interface PayoutInput {
  submissionId: string;
}

interface PayoutResult {
  payoutId: string;
  txHash: string;
  amount: number;
  mocked: boolean;
}

/**
 * Generate deterministic transaction hash for DEMO_MODE
 * Format: keccak256(submissionId|timestamp)
 */
function generateDemoTxHash(submissionId: string): string {
  const timestamp = Date.now().toString();
  const input = `${submissionId}|${timestamp}`;
  // Use keccak256 (Ethereum hash function) via ethers
  return ethers.keccak256(ethers.toUtf8Bytes(input));
}

/**
 * Execute real USDC transfer on Base Sepolia
 */
async function executeRealPayout(
  wallet: string,
  amount: number,
  usdcAddress: string,
  rpcUrl: string,
  privateKey: string
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  // USDC has 6 decimals
  const amountWei = ethers.parseUnits(amount.toString(), 6);

  // Load USDC contract ABI (minimal transfer function)
  const usdcAbi = [
    'function transfer(address to, uint256 amount) returns (bool)',
  ];

  const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, signer);

  // Execute transfer
  const tx = await usdcContract.transfer(wallet, amountWei);
  await tx.wait();

  return tx.hash;
}

/**
 * Retry helper for transient errors
 */
async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on policy violations or non-transient errors
      if (error instanceof PolicyViolation) {
        throw error;
      }

      // Check if error is transient (network, timeout, etc.)
      const isTransient = 
        error instanceof Error && (
          error.message.includes('timeout') ||
          error.message.includes('network') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT')
        );

      if (!isTransient && attempt < maxRetries - 1) {
        // Not transient, but we'll retry anyway for safety
      }

      if (attempt < maxRetries - 1) {
        // Exponential backoff
        const backoffDelay = delayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

export async function payoutAgent(input: PayoutInput): Promise<PayoutResult> {
  const { submissionId } = input;

  return await retry(async () => {
    // Load submission with all required relations
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
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
      throw new Error(`Submission ${submissionId} not found`);
    }

    if (!submission.verification_result) {
      throw new Error(`Submission ${submissionId} has no verification result`);
    }

    if (submission.status !== 'APPROVED') {
      throw new Error(`Submission ${submissionId} is not approved (status: ${submission.status})`);
    }

    // Check if payout already exists
    if (submission.payout) {
      if (submission.payout.status === 'COMPLETED') {
        return {
          payoutId: submission.payout.id,
          txHash: submission.payout.tx_hash || '',
          amount: Number(submission.payout.amount),
          mocked: submission.payout.mocked,
        };
      }
      // If payout exists but not completed, continue to retry
    }

    const quest = submission.quest;
    const rules = quest.quest_rules[0]?.rules;
    const payoutAmount = Number(quest.unit_amount);

    // Get Locus adapter
    const locus = getLocusAdapter();

    // Execute in transaction with row locking
    const result = await prisma.$transaction(async (tx) => {
      // Lock quest row (SELECT ... FOR UPDATE)
      const questData = await tx.$queryRaw<Array<{
        id: string;
        budget_remaining: any;
        unit_amount: any;
      }>>`
        SELECT id, budget_remaining, unit_amount
        FROM "Quest"
        WHERE id = ${quest.id}
        FOR UPDATE
      `;

      if (questData.length === 0) {
        throw new Error('Quest not found');
      }

      const lockedQuest = questData[0];
      const budgetRemaining = Number(lockedQuest.budget_remaining);
      const unitAmount = Number(lockedQuest.unit_amount);

      // Re-check budget
      if (budgetRemaining < unitAmount) {
        throw new PolicyViolation(
          `Insufficient budget: ${budgetRemaining} < ${unitAmount}`,
          'Quest budget exhausted'
        );
      }

      // Call Locus adapter
      const authorizeResult = await locus.authorizeSpend({
        policy: rules?.locus_policy || {},
        amount: payoutAmount,
        wallet: submission.wallet,
        questId: quest.id,
        deviceFingerprint: submission.device_fingerprint,
      });

      if (!authorizeResult.authorized) {
        throw new PolicyViolation(
          authorizeResult.reason || 'Policy violation',
          authorizeResult.reason
        );
      }

      // Decrement budget
      await tx.quest.update({
        where: { id: quest.id },
        data: {
          budget_remaining: {
            decrement: unitAmount,
          },
        },
      });

      // Create or update payout row
      const payout = await tx.payout.upsert({
        where: { submission_id: submissionId },
        update: {
          status: 'PROCESSING',
        },
        create: {
          submission_id: submissionId,
          quest_id: quest.id,
          amount: payoutAmount,
          currency: 'USDC',
          status: 'PROCESSING',
          mocked: false,
        },
      });

      // Generate tx hash
      const demoMode = process.env.DEMO_MODE === 'true';
      let txHash: string;
      let mocked = false;

      if (demoMode) {
        // DEMO_MODE: keccak256(submissionId|timestamp)
        txHash = generateDemoTxHash(submissionId);
        mocked = true;
      } else {
        // Real ERC20 transfer on Base Sepolia
        const usdcAddress = process.env.USDC_ADDRESS;
        const rpcUrl = process.env.RPC_URL;
        const hotWalletPk = process.env.HOT_WALLET_PK;

        if (!usdcAddress || !rpcUrl || !hotWalletPk) {
          throw new Error('Missing required environment variables for real payout: USDC_ADDRESS, RPC_URL, HOT_WALLET_PK');
        }

        try {
          txHash = await executeRealPayout(
            submission.wallet,
            payoutAmount,
            usdcAddress,
            rpcUrl,
            hotWalletPk
          );
        } catch (error) {
          // Update payout status to FAILED
          await tx.payout.update({
            where: { id: payout.id },
            data: {
              status: 'FAILED',
              last_error: error instanceof Error ? error.message : 'Unknown error',
            },
          });
          throw error;
        }
      }

      // Update payout with tx hash
      await tx.payout.update({
        where: { id: payout.id },
        data: {
          tx_hash: txHash,
          status: 'COMPLETED',
          mocked,
        },
      });

      // Update submission status to PAID
      await tx.submission.update({
        where: { id: submissionId },
        data: {
          status: 'PAID',
        },
      });

      // Append audit event with full trace
      const justificationHash = createHash('sha256')
        .update(submission.justification_text)
        .digest('hex');

      await locus.recordAudit({
        entityType: 'payout',
        entityId: payout.id,
        actorId: 'agent:payout',
        eventType: 'payout_completed',
        payload: {
          submission_id: submissionId,
          quest_id: quest.id,
          amount: payoutAmount,
          tx_hash: txHash,
          mocked,
          decision_trace: submission.verification_result.trace,
          justification_hash: justificationHash,
          agent_ids: ['agent:verifier', 'agent:fraud_guard', 'agent:payout'],
          timestamp: new Date().toISOString(),
        },
      });

      return {
        payoutId: payout.id,
        txHash,
        amount: payoutAmount,
        mocked,
      };
    }, 3, 1000); // 3 retries, 1s initial delay

    return result;
  });
}
