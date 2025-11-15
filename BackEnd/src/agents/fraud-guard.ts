import { PrismaClient, Submission } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

interface FraudResult {
  duplicate: boolean;
  device_velocity: number;
  risk_score: number;
  reasons: string[];
  quality_score?: number;
  quality_flags?: string[];
}

interface VerifierResult {
  rules_fired: Array<{ field: string; ok: boolean; observed: any }>;
  ocr_fields: {
    merchant: string;
    date: string;
    amount: number;
  };
}

/**
 * Calculate canonicalized receipt fingerprint
 * Format: sha256(lower(merchant)||'|'||iso_date||'|'||cents(amount))
 */
function calculateReceiptFingerprint(
  merchant: string,
  date: string,
  amount: number
): string {
  const normalizedMerchant = merchant.toLowerCase().trim();
  const normalizedDate = date.split('T')[0]; // ISO date only
  const cents = Math.round(amount * 100);
  
  const canonical = `${normalizedMerchant}|${normalizedDate}|${cents}`;
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Calculate fuzzy duplicate hash (merchant + date only)
 * Catches minor OCR variance in amounts
 */
function calculateFuzzyFingerprint(merchant: string, date: string): string {
  const normalizedMerchant = merchant.toLowerCase().trim();
  const normalizedDate = date.split('T')[0];
  
  const canonical = `${normalizedMerchant}|${normalizedDate}`;
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Check justification quality (if enabled)
 */
function checkJustificationQuality(
  justification: string,
  enableQualityScoring: boolean
): { score: number; flags: string[] } {
  if (!enableQualityScoring) {
    return { score: 1.0, flags: [] };
  }

  const flags: string[] = [];
  let score = 1.0;

  // Min length check
  const words = justification.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length < 12) {
    flags.push('too_short');
    score -= 0.2;
  } else if (words.length < 20) {
    flags.push('short');
    score -= 0.1;
  }

  // Boilerplate phrases
  const boilerplate = [
    'this is a test',
    'just testing',
    'demo submission',
    'test receipt',
  ];
  const lowerJustification = justification.toLowerCase();
  for (const phrase of boilerplate) {
    if (lowerJustification.includes(phrase)) {
      flags.push('boilerplate');
      score -= 0.3;
      break;
    }
  }

  // Pet keywords
  const petKeywords = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'food', 'toy', 'treat'];
  const hasPetKeyword = petKeywords.some(keyword => 
    lowerJustification.includes(keyword)
  );
  if (!hasPetKeyword) {
    flags.push('no_pet_keyword');
    score -= 0.2;
  }

  // Similarity check (simple Jaccard similarity)
  // For demo, we'll skip this as it requires storing previous justifications
  // In production, compare against last N justifications

  return {
    score: Math.max(0, score),
    flags,
  };
}

export async function fraudGuardAgent(
  submission: Submission,
  verifierResult: VerifierResult
): Promise<FraudResult> {
  const reasons: string[] = [];
  let risk_score = 0.1; // Default low risk

  // 1. Duplicate check (canonicalized hash)
  const receiptFingerprint = calculateReceiptFingerprint(
    verifierResult.ocr_fields.merchant,
    verifierResult.ocr_fields.date,
    verifierResult.ocr_fields.amount
  );

  // Check for exact duplicate (same wallet + same receipt)
  // Query previous submissions with verification results and compare OCR fields
  const previousSubmissions = await prisma.submission.findMany({
    where: {
      wallet: submission.wallet,
      id: { not: submission.id },
      status: { in: ['APPROVED', 'PAID'] },
    },
    include: {
      verification_result: true,
    },
  });

  // Check if any previous submission has matching receipt fingerprint
  for (const prevSub of previousSubmissions) {
    if (prevSub.verification_result?.trace) {
      const trace = prevSub.verification_result.trace as any;
      const prevOcrFields = trace.verifier?.ocr_fields || trace.ocr_fields;
      
      if (prevOcrFields) {
        const prevFingerprint = calculateReceiptFingerprint(
          prevOcrFields.merchant,
          prevOcrFields.date,
          prevOcrFields.amount
        );
        
        if (prevFingerprint === receiptFingerprint) {
          reasons.push('Exact duplicate receipt found');
          risk_score = 1.0;
          return {
            duplicate: true,
            device_velocity: 0,
            risk_score,
            reasons,
          };
        }
      }
    }
  }

  // Check for global duplicate within 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const globalSubmissions = await prisma.submission.findMany({
    where: {
      id: { not: submission.id },
      created_at: { gte: sevenDaysAgo },
      status: { in: ['APPROVED', 'PAID'] },
    },
    include: {
      verification_result: true,
    },
  });

  // Check if any global submission has matching receipt fingerprint
  for (const globalSub of globalSubmissions) {
    if (globalSub.verification_result?.trace) {
      const trace = globalSub.verification_result.trace as any;
      const globalOcrFields = trace.verifier?.ocr_fields || trace.ocr_fields;
      
      if (globalOcrFields) {
        const globalFingerprint = calculateReceiptFingerprint(
          globalOcrFields.merchant,
          globalOcrFields.date,
          globalOcrFields.amount
        );
        
        if (globalFingerprint === receiptFingerprint) {
          reasons.push('Duplicate receipt found (within 7 days)');
          risk_score = 1.0;
          return {
            duplicate: true,
            device_velocity: 0,
            risk_score,
            reasons,
          };
        }
      }
    }
  }

  // Fuzzy duplicate check (merchant + date only)
  const fuzzyFingerprint = calculateFuzzyFingerprint(
    verifierResult.ocr_fields.merchant,
    verifierResult.ocr_fields.date
  );

  const fuzzyDuplicates = await prisma.submission.findMany({
    where: {
      wallet: submission.wallet,
      id: { not: submission.id },
      created_at: { gte: sevenDaysAgo },
      status: { in: ['APPROVED', 'PAID'] },
    },
  });

  // Check if any fuzzy duplicate has similar merchant+date
  const similarCount = fuzzyDuplicates.filter((sub: any) => {
    // This is simplified - in production, would compare OCR fields
    return true; // For demo, flag if any recent submission exists
  }).length;

  if (similarCount > 0) {
    reasons.push('Similar receipt pattern detected');
    risk_score = Math.max(risk_score, 0.5);
  }

  // 2. Device velocity check
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deviceApprovals = await prisma.submission.count({
    where: {
      device_fingerprint: submission.device_fingerprint,
      quest_id: submission.quest_id,
      status: 'APPROVED',
      created_at: { gte: today },
    },
  });

  if (deviceApprovals >= 3) {
    reasons.push(`Device velocity limit exceeded: ${deviceApprovals} approvals today`);
    risk_score = Math.max(risk_score, 0.5);
  }

  // 3. Justification quality check
  const enableQualityScoring = process.env.ENABLE_QUALITY_SCORING === 'true';
  const qualityCheck = checkJustificationQuality(
    submission.justification_text,
    enableQualityScoring
  );

  if (qualityCheck.flags.length > 0 && enableQualityScoring) {
    reasons.push(`Quality flags: ${qualityCheck.flags.join(', ')}`);
    // Don't block in demo, just lower score
    risk_score = Math.max(risk_score, 0.3);
  }

  return {
    duplicate: false,
    device_velocity: deviceApprovals,
    risk_score,
    reasons,
    quality_score: qualityCheck.score,
    quality_flags: qualityCheck.flags,
  };
}

