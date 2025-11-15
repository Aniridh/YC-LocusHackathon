import { PrismaClient, Submission, PayoutStatus } from '@prisma/client';
import { getLocusAdapter } from '../locus/adapter';
import { createHash } from 'crypto';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

interface SubmissionWithDetails extends Submission {
  quest: {
    id: string;
    quest_rules: Array<{ rules: any }>;
    budget_remaining: any;
    unit_amount: any;
  };
  verification_result: {
    decision: string;
    trace: any;
    risk_score: number;
    reasons: string[];
  } | null;
}

/**
 * Generate deterministic transaction hash for DEMO_MODE
 * Format: keccak256(submission_id + timestamp)
 */
function generateDemoTxHash(submissionId: string): string {
  const timestamp = Date.now().toString();
  const input = `${submissionId}_${timestamp}`;
  return createHash('sha256').update(input).digest('hex');
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

  // Estimate gas
  const gasEstimate = await usdcContract.transfer.estimateGas(wallet, amountWei);

  // Send transaction
  const tx = await usdcContract.transfer(wallet, amountWei, {
    gasLimit: gasEstimate,
  });

  // Wait for 1 block confirmation
  const receipt = await tx.wait(1);

  return receipt.hash;
}

export async function payoutAgent(
  submission: SubmissionWithDetails
): Promise<void> {
  if (!submission.verification_result) {
    throw new Error('Verification result not found');
  }

  if (submission.verification_result.decision !== 'APPROVE') {
    throw new Error('Submission not approved');
  }

  const quest = submission.quest;
  const rules = quest.quest_rules[0]?.rules;
  const payoutAmount = parseFloat(quest.unit_amount.toString());
  const demoMode = process.env.DEMO_MODE === 'true';

  // Get Locus adapter
  const locus = getLocusAdapter();

  // Authorize spend (atomic check with Locus)
  // Pass device_fingerprint for proper velocity checking
  const authorizeResult = await locus.authorizeSpend({
    policy: rules?.locus_policy || {},
    amount: payoutAmount,
    wallet: submission.wallet,
    questId: quest.id,
    deviceFingerprint: submission.device_fingerprint,
  });

  if (!authorizeResult.authorized) {
    throw new Error(`Policy violation: ${authorizeResult.reason}`);
  }

  // Execute payout in transaction
  await prisma.$transaction(async (tx) => {
    // Lock quest and check budget again (double-check)
    const questData = await tx.quest.findUnique({
      where: { id: quest.id },
    });

    if (!questData) {
      throw new Error('Quest not found');
    }

    const budgetRemaining = parseFloat(questData.budget_remaining.toString());
    if (budgetRemaining < payoutAmount) {
      throw new Error('Budget exhausted');
    }

    // Generate or execute transaction
    let txHash: string;
    let mocked = false;

    if (demoMode) {
      // DEMO_MODE: Generate deterministic hash
      txHash = `0x${generateDemoTxHash(submission.id)}`;
      mocked = true;
    } else {
      // Real mode: Execute USDC transfer
      const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
      const usdcAddress = process.env.USDC_TEST_TOKEN_ADDRESS;
      const privateKey = process.env.PAYOUT_WALLET_PRIVATE_KEY;

      if (!rpcUrl || !usdcAddress || !privateKey) {
        throw new Error('Blockchain configuration missing');
      }

      try {
        txHash = await executeRealPayout(
          submission.wallet,
          payoutAmount,
          usdcAddress,
          rpcUrl,
          privateKey
        );
      } catch (error) {
        // Mark as failed but don't throw (allow retry)
        await tx.payout.create({
          data: {
            submission_id: submission.id,
            quest_id: quest.id,
            amount: payoutAmount,
            currency: 'USDC',
            status: 'FAILED',
            mocked: false,
          },
        });

        // Recredit budget
        await tx.quest.update({
          where: { id: quest.id },
          data: {
            budget_remaining: {
              increment: payoutAmount,
            },
          },
        });

        throw new Error(`Payout failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Update quest budget
    await tx.quest.update({
      where: { id: quest.id },
      data: {
        budget_remaining: {
          decrement: payoutAmount,
        },
      },
    });

    // Create payout record
    const payout = await tx.payout.create({
      data: {
        submission_id: submission.id,
        quest_id: quest.id,
        amount: payoutAmount,
        currency: 'USDC',
        tx_hash: txHash,
        status: 'COMPLETED',
        mocked,
      },
    });

    // Update submission status
    await tx.submission.update({
      where: { id: submission.id },
      data: { status: 'PAID' },
    });

    // Create audit event
    const justificationHash = createHash('sha256')
      .update(submission.justification_text)
      .digest('hex');

    await locus.recordAudit({
      entityType: 'payout',
      entityId: payout.id,
      actorId: 'agent:payout',
      eventType: 'payout_completed',
      payload: {
        submission_id: submission.id,
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

    // Also store in database
    await tx.auditEvent.create({
      data: {
        entity_type: 'payout',
        entity_id: payout.id,
        actor_id: 'agent:payout',
        event_type: 'payout_completed',
        payload: {
          submission_id: submission.id,
          quest_id: quest.id,
          amount: payoutAmount,
          tx_hash: txHash,
          mocked,
          decision_trace: submission.verification_result.trace,
          justification_hash: justificationHash,
          agent_ids: ['agent:verifier', 'agent:fraud_guard', 'agent:payout'],
          timestamp: new Date().toISOString(),
        },
      },
    });
  });
}

