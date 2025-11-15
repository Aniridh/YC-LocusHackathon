import { getOcrFields } from '../src/services/ocr';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('📸 Preprocessing receipts...');

  const receiptsDir = path.join(__dirname, '../seed/receipts');
  const fixturesPath = path.join(__dirname, '../fixtures/receipts.json');
  const fixturesDir = path.dirname(fixturesPath);

  // Ensure directories exist
  if (!fs.existsSync(receiptsDir)) {
    console.error(`❌ Receipts directory not found: ${receiptsDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // Read all .jpg files
  const files = fs.readdirSync(receiptsDir).filter(f => 
    f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg')
  );

  if (files.length === 0) {
    console.warn('⚠️  No receipt images found in', receiptsDir);
    process.exit(0);
  }

  console.log(`Found ${files.length} receipt image(s)`);

  const fixtures: Record<string, { merchant: string; date: string; amount: number }> = {};

  // Process each image
  for (const file of files) {
    const imagePath = path.join(receiptsDir, file);
    console.log(`Processing ${file}...`);

    try {
      // Read image
      const imageBuffer = fs.readFileSync(imagePath);

      // Calculate SHA256 hash
      const imageHash = createHash('sha256').update(imageBuffer).digest('hex');

      // Call OCR
      const ocrFields = await getOcrFields(
        imageBuffer,
        imageHash,
        { demoMode: false } // Use real OCR for preprocessing
      );

      // Convert to fixtures format (amount in dollars, date as ISO)
      fixtures[imageHash] = {
        merchant: ocrFields.merchant,
        date: ocrFields.dateISO,
        amount: ocrFields.amountCents / 100,
      };

      console.log(`✅ ${file}: ${ocrFields.merchant}, ${ocrFields.dateISO}, $${(ocrFields.amountCents / 100).toFixed(2)}`);
    } catch (error) {
      console.error(`❌ Failed to process ${file}:`, error instanceof Error ? error.message : error);
    }
  }

  // Write fixtures file
  fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2));
  console.log(`\n✅ Wrote ${Object.keys(fixtures).length} fixtures to ${fixturesPath}`);
}

main()
  .catch((error) => {
    console.error('❌ Preprocessing failed:', error);
    process.exit(1);
  });
