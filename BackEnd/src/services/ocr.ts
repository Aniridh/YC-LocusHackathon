import prisma from '../db/client';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

interface OcrFields {
  merchant: string;
  dateISO: string;
  amountCents: number;
  confidence: number;
}

interface OcrOptions {
  demoMode?: boolean;
  provider?: 'vision' | 'textract';
}

// Load fixtures once at startup
let fixtures: Record<string, OcrFields> = {};
const fixturesPath = path.join(__dirname, '../../fixtures/receipts.json');

if (fs.existsSync(fixturesPath)) {
  try {
    const fixturesData = fs.readFileSync(fixturesPath, 'utf-8');
    const rawFixtures = JSON.parse(fixturesData);
    // Convert to OcrFields format
    for (const [hash, data] of Object.entries(rawFixtures) as [string, any][]) {
      fixtures[hash] = {
        merchant: data.merchant.toLowerCase(),
        dateISO: data.date,
        amountCents: Math.round(data.amount * 100),
        confidence: 0.95,
      };
    }
  } catch (error) {
    console.warn('⚠️  Failed to load fixtures:', error);
  }
}

function isFixture(imageHash: string): boolean {
  return imageHash in fixtures || imageHash.startsWith('demo_hash_');
}

function getFixtureData(imageHash: string): OcrFields | null {
  if (fixtures[imageHash]) {
    return fixtures[imageHash];
  }
  
  if (imageHash.startsWith('demo_hash_')) {
    const demoIndex = imageHash.replace('demo_hash_', '');
    const demoKeys = Object.keys(fixtures);
    if (demoKeys.length > 0) {
      const index = parseInt(demoIndex) % demoKeys.length;
      return fixtures[demoKeys[index]] || fixtures[demoKeys[0]];
    }
  }
  
  return null;
}

async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(imageBuffer)
      .resize(2000, null, { withoutEnlargement: true })
      .greyscale()
      .normalize()
      .toBuffer();
  } catch (error) {
    console.warn('⚠️  Image preprocessing failed, using original:', error);
    return imageBuffer;
  }
}

function parseMerchant(text: string): string {
  const merchantPatterns = [
    { pattern: /chewy/i, value: 'chewy' },
    { pattern: /petco|pet\s*co/i, value: 'petco' },
  ];
  
  for (const { pattern, value } of merchantPatterns) {
    if (pattern.test(text)) {
      return value;
    }
  }
  
  return 'unknown';
}

function parseDate(text: string): string {
  const datePatterns = [
    /\d{1,2}\/\d{1,2}\/\d{2,4}/,
    /\d{4}-\d{2}-\d{2}/,
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s,]+(\d{1,2})[\s,]+(\d{2,4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const parsed = new Date(match[0]);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      } catch {
        // Keep trying
      }
    }
  }

  return new Date().toISOString().split('T')[0];
}

function parseAmount(text: string): number {
  const amountPattern = /\$(\d+\.\d{2})/;
  const match = text.match(amountPattern);
  if (match) {
    return Math.round(parseFloat(match[1]) * 100);
  }
  return 0;
}

async function extractWithGoogleVision(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
  const client = new ImageAnnotatorClient();
  const [result] = await client.textDetection({
    image: { content: imageBuffer },
  });

  const detections = result.textAnnotations;
  if (!detections || detections.length === 0) {
    throw new Error('No text detected');
  }

  const fullText = detections[0].description || '';
  const confidence = detections[0].confidence || 0.8;

  return { text: fullText, confidence };
}

async function extractWithTextract(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
  const client = new TextractClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const command = new DetectDocumentTextCommand({
    Document: { Bytes: imageBuffer },
  });

  const response = await client.send(command);
  
  if (!response.Blocks) {
    throw new Error('No text detected');
  }

  const textBlocks = response.Blocks
    .filter(block => block.BlockType === 'LINE')
    .map(block => block.Text)
    .filter(Boolean)
    .join('\n');

  const confidence = response.Blocks[0]?.Confidence ? response.Blocks[0].Confidence / 100 : 0.8;

  return { text: textBlocks, confidence: confidence };
}

export async function getOcrFields(
  imageBuf: Buffer,
  sha256: string,
  opts: OcrOptions = {}
): Promise<OcrFields> {
  const { demoMode = false, provider = 'vision' } = opts;

  // 1. Check DB cache
  const cached = await prisma.ocrCache.findUnique({
    where: { image_hash: sha256 },
  });

  if (cached && cached.fields) {
    const fields = cached.fields as any;
    return {
      merchant: fields.merchant || 'unknown',
      dateISO: fields.dateISO || fields.date || new Date().toISOString().split('T')[0],
      amountCents: fields.amountCents || Math.round((fields.amount || 0) * 100),
      confidence: 0.9,
    };
  }

  // 2. Check fixtures (if DEMO_MODE)
  if (demoMode && isFixture(sha256)) {
    const fixtureData = getFixtureData(sha256);
    if (fixtureData) {
      await prisma.ocrCache.upsert({
        where: { image_hash: sha256 },
        update: {},
        create: {
          image_hash: sha256,
          fields: fixtureData,
        },
      });
      return fixtureData;
    }
  }

  // 3. Call OCR provider with timeout
  try {
    const preprocessed = await preprocessImage(imageBuf);
    
    const ocrResult = await Promise.race([
      provider === 'textract' 
        ? extractWithTextract(preprocessed)
        : extractWithGoogleVision(preprocessed),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('OCR timeout')), 1000)
      ),
    ]);

    // Parse and normalize fields
    const merchant = parseMerchant(ocrResult.text);
    const dateISO = parseDate(ocrResult.text);
    const amountCents = parseAmount(ocrResult.text);

    if (!merchant || merchant === 'unknown' || amountCents === 0) {
      throw new Error('Failed to extract required fields');
    }

    const fields: OcrFields = {
      merchant: merchant.toLowerCase(),
      dateISO,
      amountCents,
      confidence: ocrResult.confidence,
    };

    // Cache result
    await prisma.ocrCache.upsert({
      where: { image_hash: sha256 },
      update: { fields },
      create: {
        image_hash: sha256,
        fields,
      },
    });

    return fields;
  } catch (error) {
    console.error('❌ OCR extraction failed:', error);

    // 4. Fallback to fixture (even if not in demo mode, for resilience)
    const fixtureData = getFixtureData(sha256);
    if (fixtureData) {
      return fixtureData;
    }

    // 5. Last resort: throw error
    throw new Error('OCR_UNREADABLE');
  }
}
