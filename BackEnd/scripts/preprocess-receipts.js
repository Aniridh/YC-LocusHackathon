"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const ocr_1 = require("../src/services/ocr");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
    const files = fs.readdirSync(receiptsDir).filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'));
    if (files.length === 0) {
        console.warn('⚠️  No receipt images found in', receiptsDir);
        process.exit(0);
    }
    console.log(`Found ${files.length} receipt image(s)`);
    const fixtures = {};
    // Process each image
    for (const file of files) {
        const imagePath = path.join(receiptsDir, file);
        console.log(`Processing ${file}...`);
        try {
            // Read image
            const imageBuffer = fs.readFileSync(imagePath);
            // Calculate SHA256 hash
            const imageHash = (0, crypto_1.createHash)('sha256').update(imageBuffer).digest('hex');
            // Call OCR
            const ocrFields = await (0, ocr_1.getOcrFields)(imageBuffer, imageHash, { demoMode: false } // Use real OCR for preprocessing
            );
            // Convert to fixtures format (amount in dollars, date as ISO)
            fixtures[imageHash] = {
                merchant: ocrFields.merchant,
                date: ocrFields.dateISO,
                amount: ocrFields.amountCents / 100,
            };
            console.log(`✅ ${file}: ${ocrFields.merchant}, ${ocrFields.dateISO}, $${(ocrFields.amountCents / 100).toFixed(2)}`);
        }
        catch (error) {
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
//# sourceMappingURL=preprocess-receipts.js.map