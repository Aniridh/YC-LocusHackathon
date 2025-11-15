import { PrismaClient, Submission } from '@prisma/client';
import { extractReceiptFields } from '../services/ocr';
import { differenceInDays, parseISO } from 'date-fns';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface RuleTrace {
  field: string;
  ok: boolean;
  observed: any;
  expected?: any;
  reason?: string;
}

interface VerifierResult {
  rules_fired: RuleTrace[];
  ocr_fields: {
    merchant: string;
    date: string;
    amount: number;
  };
  confidence: number;
}

export async function verifierAgent(
  submission: Submission & {
    quest: {
      quest_rules: Array<{ rules: any }>;
    };
    contributor: { age: number | null } | null;
  }
): Promise<VerifierResult> {
  const rules = submission.quest.quest_rules[0]?.rules;
  if (!rules || !rules.eligibility) {
    throw new Error('Quest rules not found');
  }

  // Load receipt image
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
    // Try alternative path
    try {
      imageBuffer = fs.readFileSync(`backend/${fullPath}`);
    } catch {
      throw new Error(`Receipt image not found: ${fullPath}`);
    }
  }

  // Extract OCR fields
  const demoMode = process.env.DEMO_MODE === 'true';
  const ocrResult = await extractReceiptFields(
    imageBuffer,
    submission.content_hash,
    demoMode
  );

  const ocrFields = ocrResult.fields;
  const rules_fired: RuleTrace[] = [];

  // Check each eligibility predicate
  for (const predicate of rules.eligibility) {
    const { field, op, value } = predicate;
    let ok = false;
    let observed: any = null;
    let reason: string | undefined;

    switch (field) {
      case 'merchant': {
        const merchantLower = ocrFields.merchant.toLowerCase();
        const allowedMerchants = Array.isArray(value) 
          ? value.map((v: string) => v.toLowerCase())
          : [value.toLowerCase()];
        
        ok = allowedMerchants.some((allowed: string) => 
          merchantLower.includes(allowed) || allowed.includes(merchantLower)
        );
        observed = ocrFields.merchant;
        if (!ok) {
          const valueDisplay = Array.isArray(value) ? value.join(', ') : String(value);
          reason = `Merchant "${observed}" not in allowed list: ${valueDisplay}`;
        }
        break;
      }

      case 'receipt_age_days': {
        try {
          const receiptDate = parseISO(ocrFields.date);
          const ageDays = differenceInDays(new Date(), receiptDate);
          ok = op === '<=' ? ageDays <= value : ageDays >= value;
          observed = ageDays;
          if (!ok) {
            reason = `Receipt age ${observed} days does not satisfy ${op} ${value}`;
          }
        } catch (error) {
          ok = false;
          observed = 'invalid_date';
          reason = `Could not parse receipt date: ${ocrFields.date}`;
        }
        break;
      }

      case 'amount': {
        ok = op === '<=' ? ocrFields.amount <= value : ocrFields.amount >= value;
        observed = ocrFields.amount;
        if (!ok) {
          reason = `Amount $${observed} does not satisfy ${op} $${value}`;
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
          reason = `ZIP prefix "${observed}" not in allowed list: ${valueDisplay}`;
        }
        break;
      }

      case 'age': {
        const contributorAge = submission.contributor?.age;
        if (!contributorAge) {
          ok = false;
          observed = 'unknown';
          reason = 'Contributor age not provided';
        } else {
          ok = op === '>=' ? contributorAge >= value : contributorAge <= value;
          observed = contributorAge;
          if (!ok) {
            reason = `Age ${observed} does not satisfy ${op} ${value}`;
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
      ok,
      observed,
      expected: value,
      reason,
    });
  }

  return {
    rules_fired,
    ocr_fields: ocrFields,
    confidence: ocrResult.confidence,
  };
}

