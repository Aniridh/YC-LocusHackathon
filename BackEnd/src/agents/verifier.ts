import { Submission } from '@prisma/client';
import prisma from '../db/client';
import { getOcrFields } from '../services/ocr';
import { differenceInDays, parseISO } from 'date-fns';
import * as fs from 'fs';
import { ErrorCode } from '../utils/errors';

interface VerifierInput {
  submissionId: string;
}

interface RuleTrace {
  field: string;
  observed: any;
  ok: boolean;
  reason?: string;
}

interface VerifierResult {
  rules_fired: RuleTrace[];
  confidence: number;
  normalizedFields: {
    merchant: string;
    dateISO: string;
    amountCents: number;
  };
}

export class VerifierError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'VerifierError';
  }
}

export async function verifierAgent(input: VerifierInput): Promise<VerifierResult> {
  const { submissionId } = input;

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
    throw new VerifierError(
      ErrorCode.SUBMISSION_NOT_FOUND,
      'Submission not found'
    );
  }

  if (!submission.quest.quest_rules[0]) {
    throw new VerifierError(
      ErrorCode.INVALID_INPUT,
      'Quest rules not found'
    );
  }

  const rules = submission.quest.quest_rules[0].rules;

  // Fetch image
  const receiptPath = submission.receipt_url.startsWith('/')
    ? submission.receipt_url.slice(1)
    : submission.receipt_url;
  
  const fullPath = receiptPath.startsWith('uploads/')
    ? receiptPath
    : `uploads/raw/${receiptPath}`;

  let imageBuffer: Buffer;
  try {
    imageBuffer = fs.readFileSync(fullPath);
  } catch (error) {
    try {
      imageBuffer = fs.readFileSync(`BackEnd/${fullPath}`);
    } catch {
      throw new VerifierError(
        ErrorCode.OCR_UNREADABLE,
        'Receipt image not found. Please upload a valid receipt image.'
      );
    }
  }

  // Call OCR wrapper
  const demoMode = process.env.DEMO_MODE === 'true';
  const ocrProvider = (process.env.OCR_PROVIDER as 'vision' | 'textract') || 'vision';
  
  let ocrFields;
  try {
    ocrFields = await getOcrFields(
      imageBuffer,
      submission.content_hash,
      { demoMode, provider: ocrProvider }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'OCR_UNREADABLE') {
      throw new VerifierError(
        ErrorCode.OCR_UNREADABLE,
        'Could not read receipt. Please try a clearer photo.'
      );
    }
    throw new VerifierError(
      ErrorCode.OCR_UNREADABLE,
      'Failed to process receipt image. Please try again.'
    );
  }

  const normalizedFields = {
    merchant: ocrFields.merchant,
    dateISO: ocrFields.dateISO,
    amountCents: ocrFields.amountCents,
  };

  const rules_fired: RuleTrace[] = [];

  // Check each eligibility predicate
  if (!rules.eligibility || !Array.isArray(rules.eligibility)) {
    throw new VerifierError(
      ErrorCode.INVALID_INPUT,
      'Invalid quest rules: eligibility predicates not found'
    );
  }

  for (const predicate of rules.eligibility) {
    const { field, op, value } = predicate;
    let ok = false;
    let observed: any = null;
    let reason: string | undefined;

    switch (field) {
      case 'merchant': {
        const merchantLower = normalizedFields.merchant.toLowerCase();
        const allowedMerchants = Array.isArray(value) 
          ? value.map((v: string) => v.toLowerCase())
          : [value.toLowerCase()];
        
        ok = allowedMerchants.some((allowed: string) => 
          merchantLower.includes(allowed) || allowed.includes(merchantLower)
        );
        observed = normalizedFields.merchant;
        if (!ok) {
          const valueDisplay = Array.isArray(value) ? value.join(', ') : String(value);
          reason = `Merchant "${observed}" is not in the allowed list: ${valueDisplay}`;
        }
        break;
      }

      case 'receipt_age_days': {
        try {
          const receiptDate = parseISO(normalizedFields.dateISO);
          if (isNaN(receiptDate.getTime())) {
            ok = false;
            observed = 'invalid_date';
            reason = `Could not parse receipt date: ${normalizedFields.dateISO}`;
          } else {
            const ageDays = differenceInDays(new Date(), receiptDate);
            ok = op === '<=' ? ageDays <= value : ageDays >= value;
            observed = ageDays;
            if (!ok) {
              reason = `Receipt is ${observed} days old, but must be ${op === '<=' ? 'at most' : 'at least'} ${value} days old`;
            }
          }
        } catch (error) {
          ok = false;
          observed = 'invalid_date';
          reason = `Could not parse receipt date: ${normalizedFields.dateISO}`;
        }
        break;
      }

      case 'amount': {
        // Amount is in cents, compare against value (which should be in cents)
        const amountCents = normalizedFields.amountCents;
        const thresholdCents = typeof value === 'number' ? value : parseFloat(value) * 100;
        ok = op === '<=' ? amountCents <= thresholdCents : amountCents >= thresholdCents;
        observed = amountCents;
        if (!ok) {
          const observedDollars = (amountCents / 100).toFixed(2);
          const thresholdDollars = (thresholdCents / 100).toFixed(2);
          reason = `Amount $${observedDollars} does not satisfy ${op} $${thresholdDollars}`;
        }
        break;
      }

      case 'zip_prefix': {
        const allowedPrefixes = Array.isArray(value) ? value : [value];
        ok = allowedPrefixes.some((prefix: string) => 
          submission.zip_prefix.startsWith(prefix)
        );
        observed = submission.zip_prefix;
        if (!ok) {
          const valueDisplay = Array.isArray(value) ? value.join(', ') : String(value);
          reason = `ZIP code "${observed}" does not match required prefixes: ${valueDisplay}`;
        }
        break;
      }

      case 'age': {
        const contributorAge = submission.contributor?.age;
        if (!contributorAge) {
          ok = false;
          observed = 'unknown';
          reason = 'Age verification required but not provided';
        } else {
          ok = op === '>=' ? contributorAge >= value : contributorAge <= value;
          observed = contributorAge;
          if (!ok) {
            reason = `Age ${observed} does not meet the requirement of ${op} ${value}`;
          }
        }
        break;
      }

      default:
        ok = false;
        observed = 'unknown_field';
        reason = `Unknown predicate field: ${field}`;
    }

    rules_fired.push({
      field,
      observed,
      ok,
      reason,
    });
  }

  return {
    rules_fired,
    confidence: ocrFields.confidence,
    normalizedFields,
  };
}
