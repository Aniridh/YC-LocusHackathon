export type SubmissionStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID'
  | 'FAILED';

export interface EligibilityPredicate {
  field: string;
  op: '<=' | '>=' | 'in' | 'not_in';
  value: string | number | string[] | number[];
}

export interface Quest {
  id: string;
  name: string;
  currency: string;
  unit_amount: number;
  budget_total: number;
  budget_remaining: number;
  eligibility: EligibilityPredicate[];
  created_at: string;
}

export interface RuleTrace {
  field: string;
  observed: any;
  ok: boolean;
  reason?: string;
}

export interface VerifierResult {
  rules_fired: RuleTrace[];
  confidence: number;
  normalizedFields: {
    merchant: string;
    dateISO: string;
    amountCents: number;
  };
}

export interface FraudGuardResult {
  riskScore: number;
  flags: string[];
  qualityScore?: number;
}

export interface VerificationTrace {
  verifier: VerifierResult;
  fraud_guard: FraudGuardResult;
}

export interface AuditEvent {
  actor_id: string;
  event_type: string;
  payload: any;
  timestamp: string;
}

export interface AuditRecord {
  payout_id: string;
  submission_id: string;
  amount: number;
  currency: string;
  tx_hash: string | null;
  mocked: boolean;
  status: string;
  created_at: string;
  decision_trace: VerificationTrace | null;
  audit_events: AuditEvent[];
  requestId: string;
}

export interface QueueStats {
  queued: number;
  processing: number;
  requestId: string;
}

