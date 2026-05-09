/**
 * ============================================================================
 * Test Data Generator — Fake Medical Documents
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OUTPUT_DIR = path.join(__dirname, "..", "perf", "test-data");

const SIZES = {
  "10kb": 10 * 1024,
  "100kb": 100 * 1024,
  "1mb": 1024 * 1024,
  "5mb": 5 * 1024 * 1024
};

function generateFile(filename, sizeBytes) {
  const filePath = path.join(OUTPUT_DIR, filename);
  // Fill with random data
  const buffer = crypto.randomBytes(sizeBytes);
  // Add PDF magic bytes
  buffer.write("%PDF-1.4\n", 0);
  fs.writeFileSync(filePath, buffer);
  console.log(`  ✓ Generated: ${filename} (${(sizeBytes / 1024).toFixed(0)} KB)`);
}

function main() {
  console.log("Generating Test Data...");
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [name, size] of Object.entries(SIZES)) {
    generateFile(`sample-${name}.pdf`, size);
  }

  // Generate realistic JSON metadata
  const metadata = {
    patientId: "PT-847294",
    documentType: "BloodTest_CompletePanel",
    date: new Date().toISOString(),
    department: "Hematology",
    summary: "Routine complete blood count. All values within normal ranges.",
    checksum: crypto.randomBytes(32).toString('hex')
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "metadata-template.json"), JSON.stringify(metadata, null, 2));
  console.log("  ✓ Generated: metadata-template.json");
  console.log("✅ Test data generation complete.");
}

if (require.main === module) main();
module.exports = { main };
