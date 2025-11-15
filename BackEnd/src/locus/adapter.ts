import prisma from '../db/client';


export type AuthorizeResult = {
  authorized: boolean;
  reason?: string;
};

export interface LocusLike {
  authorizeSpend(p: {
    policy: any;
    amount: number;
    wallet: string;
    questId: string;
    deviceFingerprint?: string; // Optional device fingerprint for velocity checks
  }): Promise<AuthorizeResult>;
  recordAudit(e: {
    entityType: string;
    entityId: string;
    actorId: string;
    eventType: string;
    payload: any;
  }): Promise<void>;
}

export class LocusAdapterUnavailable extends Error {
  constructor(message: string = 'Locus adapter unavailable') {
    super(message);
    this.name = 'LocusAdapterUnavailable';
  }
}

export class PolicyViolation extends Error {
  constructor(public reason: string) {
    super(`Policy violation: ${reason}`);
    this.name = 'PolicyViolation';
  }
}

/**
 * Locus Adapter Stub
 * 
 * This stub implementation enforces policy rules in the database.
 * 
 * Assumptions:
 * - Locus API expects { policy, amount, wallet, questId } and returns { authorized: boolean, reason?: string }
 * - If real API differs, update this interface and the stub implementation
 * 
 * To swap to real Locus SDK:
 * 1. Replace LocusAdapterStub class with real SDK client
 * 2. Update authorizeSpend to call real API
 * 3. Update recordAudit to call real API
 * 4. No other code changes needed (all callers use LocusLike interface)
 */
export class LocusAdapterStub implements LocusLike {
  async authorizeSpend(p: {
    policy: any;
    amount: number;
    wallet: string;
    questId: string;
    deviceFingerprint?: string;
  }): Promise<AuthorizeResult> {
    const { policy, amount, wallet, questId, deviceFingerprint } = p;

    // Load quest with lock (atomic check)
    // Use Prisma's parameterized query
    const quest = await prisma.$queryRaw<Array<{
      id: string;
      budget_remaining: any;
      unit_amount: any;
    }>>`
      SELECT id, budget_remaining, unit_amount
      FROM "Quest"
      WHERE id = ${questId}
      FOR UPDATE
    `;

    if (quest.length === 0) {
      return {
        authorized: false,
        reason: 'Quest not found',
      };
    }

    const questData = quest[0];
    const budgetRemaining = parseFloat(questData.budget_remaining.toString());
    const unitAmount = parseFloat(questData.unit_amount.toString());

    // Check max_per_payout
    if (policy.max_per_payout && amount > policy.max_per_payout) {
      return {
        authorized: false,
        reason: `Amount ${amount} exceeds max_per_payout ${policy.max_per_payout}`,
      };
    }

    // Check budget_remaining
    if (budgetRemaining < unitAmount) {
      return {
        authorized: false,
        reason: `Budget exhausted. Remaining: ${budgetRemaining}, Required: ${unitAmount}`,
      };
    }

    // Check daily spend
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const todayPayouts = await prisma.payout.aggregate({
      where: {
        quest_id: questId,
        created_at: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
        status: 'COMPLETED',
      },
      _sum: {
        amount: true,
      },
    });

    const dailySpend = parseFloat(todayPayouts._sum.amount?.toString() || '0');
    if (policy.max_per_day && dailySpend + amount > policy.max_per_day) {
      return {
        authorized: false,
        reason: `Daily limit exceeded. Current: ${dailySpend}, Attempted: ${amount}, Max: ${policy.max_per_day}`,
      };
    }

    // Check vendor allow-list (if provided in policy)
    // This is checked in the verifier, but we can double-check here

    // Check velocity limits (if provided)
    if (policy.velocity) {
      // Use device_fingerprint if provided, otherwise fall back to wallet
      // Prisma doesn't support dynamic field names, so we need separate queries
      let deviceApprovals: number;
      
      if (deviceFingerprint) {
        deviceApprovals = await prisma.submission.count({
          where: {
            quest_id: questId,
            device_fingerprint: deviceFingerprint,
            status: 'APPROVED',
            created_at: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        });
      } else {
        // Fallback to wallet-based check if device_fingerprint not provided
        deviceApprovals = await prisma.submission.count({
          where: {
            quest_id: questId,
            wallet,
            status: 'APPROVED',
            created_at: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        });
      }

      if (policy.velocity.max_approvals_per_device_per_day) {
        const maxApprovals = policy.velocity.max_approvals_per_device_per_day;
        if (deviceApprovals >= maxApprovals) {
          return {
            authorized: false,
            reason: `Velocity limit exceeded. Approvals today: ${deviceApprovals}, Max: ${maxApprovals}`,
          };
        }
      }
    }

    return {
      authorized: true,
    };
  }

  async recordAudit(e: {
    entityType: string;
    entityId: string;
    actorId: string;
    eventType: string;
    payload: any;
  }): Promise<void> {
    // Store audit event in database
    await prisma.auditEvent.create({
      data: {
        entity_type: e.entityType,
        entity_id: e.entityId,
        actor_id: e.actorId,
        event_type: e.eventType,
        payload: e.payload,
      },
    });
  }
}

// Dependency injection: Get Locus adapter instance
let locusAdapterInstance: LocusLike | null = null;

export function getLocusAdapter(): LocusLike {
  if (!locusAdapterInstance) {
    // For now, use stub. In production, check env var for real SDK
    const useRealLocus = process.env.USE_REAL_LOCUS === 'true';
    
    if (useRealLocus) {
      // TODO: Initialize real Locus SDK here
      // locusAdapterInstance = new LocusSDK({ apiKey: process.env.LOCUS_API_KEY });
      throw new Error('Real Locus SDK not yet implemented. Set USE_REAL_LOCUS=false or implement SDK integration.');
    } else {
      locusAdapterInstance = new LocusAdapterStub();
    }
  }
  
  return locusAdapterInstance;
}

