import prisma from '../db/client';

export interface AuthorizeResult {
  authorized: boolean;
  reason?: string;
  remainingBudget?: number;
}

export class AdapterUnavailable extends Error {
  constructor(message: string = 'Locus adapter is unavailable') {
    super(message);
    this.name = 'AdapterUnavailable';
  }
}

export class PolicyViolation extends Error {
  constructor(
    public reason: string,
    message?: string
  ) {
    super(message || reason);
    this.name = 'PolicyViolation';
  }
}

export interface LocusAdapter {
  authorizeSpend(params: {
    policy: any;
    amount: number;
    wallet: string;
    questId: string;
    deviceFingerprint?: string;
  }): Promise<AuthorizeResult>;
  
  recordAudit(event: {
    entityType: string;
    entityId: string;
    actorId: string;
    eventType: string;
    payload: any;
  }): Promise<void>;
}

interface AuthorizeSpendParams {
  policy: any;
  amount: number;
  wallet: string;
  questId: string;
  deviceFingerprint?: string;
}

class LocusAdapterStub implements LocusAdapter {
  async authorizeSpend(params: AuthorizeSpendParams): Promise<AuthorizeResult> {
    const { policy, amount, wallet, questId, deviceFingerprint } = params;

    // Load quest to check budget
    const quest = await prisma.quest.findUnique({
      where: { id: questId },
    });

    if (!quest) {
      throw new PolicyViolation('Quest not found', 'Invalid quest ID');
    }

    // 1. Check budget remaining
    if (policy.max_per_payout !== undefined) {
      if (amount > policy.max_per_payout) {
        throw new PolicyViolation(
          `Amount $${amount} exceeds max per payout of $${policy.max_per_payout}`,
          'Payout amount exceeds policy limit'
        );
      }
    }

    // Check quest budget remaining
    const budgetRemaining = Number(quest.budget_remaining);
    if (amount > budgetRemaining) {
      throw new PolicyViolation(
        `Amount $${amount} exceeds remaining budget of $${budgetRemaining}`,
        'Insufficient quest budget'
      );
    }

    // 2. Check daily spend sum
    if (policy.max_per_day !== undefined) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dailySpend = await prisma.payout.aggregate({
        where: {
          quest_id: questId,
          status: 'COMPLETED',
          created_at: { gte: today },
        },
        _sum: {
          amount: true,
        },
      });

      const totalDailySpend = Number(dailySpend._sum.amount || 0);
      if (totalDailySpend + amount > policy.max_per_day) {
        throw new PolicyViolation(
          `Daily spend limit would be exceeded: $${totalDailySpend + amount} > $${policy.max_per_day}`,
          'Daily spend limit exceeded'
        );
      }
    }

    // 3. Check vendor allow-list (if provided in policy)
    if (policy.vendor_allow_list && Array.isArray(policy.vendor_allow_list)) {
      // This check is done at verification time, not here
      // But we can validate the policy structure
    }

    // 4. Check justification required
    if (policy.require_justification) {
      // This check is done at submission time, not here
      // But we can validate the policy structure
    }

    // 5. Check velocity limits (optional daily counters)
    if (policy.velocity) {
      const maxApprovals = policy.velocity.max_approvals_per_device_per_day;
      if (maxApprovals !== undefined) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // For per-device velocity limits, device_fingerprint is required
        if (!deviceFingerprint) {
          throw new PolicyViolation(
            'Device fingerprint required for velocity limit enforcement',
            'Device fingerprint missing'
          );
        }

        const deviceApprovals = await prisma.submission.count({
          where: {
            quest_id: questId,
            device_fingerprint: deviceFingerprint,
            status: 'APPROVED',
            created_at: {
              gte: today,
            },
          },
        });

        if (deviceApprovals >= maxApprovals) {
          throw new PolicyViolation(
            `Device velocity limit exceeded: ${deviceApprovals} approvals today (max: ${maxApprovals})`,
            'Velocity limit exceeded'
          );
        }
      }
    }

    // Optional: Use daily counters for atomic limit enforcement
    if (policy.enable_daily_counters) {
      const today = new Date();
      const yyyymmdd = today.toISOString().split('T')[0].replace(/-/g, '');

      // Use raw SQL for atomic upsert with composite key
      // Prisma doesn't support upsert with composite unique constraints directly
      await prisma.$executeRaw`
        INSERT INTO "DailyCounter" (wallet, quest_id, yyyymmdd, count)
        VALUES (${wallet}, ${questId}, ${yyyymmdd}, 1)
        ON CONFLICT (wallet, quest_id, yyyymmdd)
        DO UPDATE SET count = "DailyCounter".count + 1
      `;

      // Fetch the counter to check limits
      const counter = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count FROM "DailyCounter"
        WHERE wallet = ${wallet} AND quest_id = ${questId} AND yyyymmdd = ${yyyymmdd}
      `;
      
      const currentCount = counter[0]?.count || 0;

      if (policy.max_approvals_per_wallet_per_day) {
        if (currentCount > policy.max_approvals_per_wallet_per_day) {
          throw new PolicyViolation(
            `Wallet daily limit exceeded: ${currentCount} approvals today (max: ${policy.max_approvals_per_wallet_per_day})`,
            'Daily wallet limit exceeded'
          );
        }
      }
    }

    return {
      authorized: true,
      remainingBudget: budgetRemaining - amount,
    };
  }

  async recordAudit(event: {
    entityType: string;
    entityId: string;
    actorId: string;
    eventType: string;
    payload: any;
  }): Promise<void> {
    try {
      await prisma.auditEvent.create({
        data: {
          entity_type: event.entityType,
          entity_id: event.entityId,
          actor_id: event.actorId,
          event_type: event.eventType,
          payload: event.payload,
        },
      });
    } catch (error) {
      // Log but don't throw - audit failures shouldn't block operations
      console.error('Failed to record audit event:', error);
    }
  }
}

let adapterInstance: LocusAdapter | null = null;

export function getLocusAdapter(): LocusAdapter {
  if (!adapterInstance) {
    adapterInstance = new LocusAdapterStub();
  }
  return adapterInstance;
}
