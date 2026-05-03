const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const baselinePath = path.join(dataDir, "baseline-gas-results.json");
const optimizedPath = path.join(dataDir, "optimized-gas-results.json");
const summaryPath = path.join(dataDir, "gas-comparison-summary.json");
const markdownPath = path.join(dataDir, "gas-comparison-summary.md");

const mappings = [
  ["Patient Registration", "registerPatient", "registerPatients"],
  ["Doctor Registration", "registerDoctor", "registerDoctors"],
  ["Access Grant / Consent Grant", "grantAccess", "grantConsent"],
  ["Access Revoke / Consent Revoke", "revokeAccess", "revokeConsent"],
  ["Record Creation", "addMedicalRecord", "createRecord"],
  ["Record Update", null, "updateRecord"],
  ["Audit Write", "addAuditLog", null],
  ["Record Revoke", null, "revokeRecord"],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getMean(data, key) {
  return key ? data?.operations?.[key]?.gas?.mean ?? null : null;
}

function buildComparisons(baseline, optimized) {
  return mappings.map(([category, baselineKey, optimizedKey]) => {
    const baselineMean = getMean(baseline, baselineKey);
    const optimizedMean = getMean(optimized, optimizedKey);
    const comparable = baselineMean !== null && optimizedMean !== null;
    const difference = comparable ? Number((optimizedMean - baselineMean).toFixed(2)) : null;
    const pctChange = comparable && baselineMean !== 0
      ? Number((((optimizedMean - baselineMean) / baselineMean) * 100).toFixed(2))
      : null;

    return {
      category,
      baselineKey,
      optimizedKey,
      baselineMean,
      optimizedMean,
      difference,
      pctChange,
      comparable,
    };
  });
}

function totals(comparisons) {
  const matched = comparisons.filter((item) => item.comparable);
  const baselineTotal = matched.reduce((sum, item) => sum + item.baselineMean, 0);
  const optimizedTotal = matched.reduce((sum, item) => sum + item.optimizedMean, 0);
  const pctChange = baselineTotal === 0 ? null : Number((((optimizedTotal - baselineTotal) / baselineTotal) * 100).toFixed(2));

  return {
    matchedOperations: matched.length,
    baselineTotal: Number(baselineTotal.toFixed(2)),
    optimizedTotal: Number(optimizedTotal.toFixed(2)),
    difference: Number((optimizedTotal - baselineTotal).toFixed(2)),
    pctChange,
  };
}

function toMarkdown(summary) {
  const lines = [];
  lines.push("# Gas Comparison Summary");
  lines.push("");
  lines.push(`Generated at: ${summary.generatedAt}`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Matched operations: ${summary.totals.matchedOperations}`);
  lines.push(`- Baseline total mean gas: ${summary.totals.baselineTotal}`);
  lines.push(`- Optimized total mean gas: ${summary.totals.optimizedTotal}`);
  lines.push(`- Difference: ${summary.totals.difference}`);
  lines.push(`- Percentage change: ${summary.totals.pctChange ?? "N/A"}%`);
  lines.push("");
  lines.push("## Per Operation");
  lines.push("");

  for (const item of summary.comparisons) {
    lines.push(`### ${item.category}`);
    lines.push(`- Baseline: ${item.baselineMean ?? "N/A"}`);
    lines.push(`- Optimized: ${item.optimizedMean ?? "N/A"}`);
    lines.push(`- Difference: ${item.difference ?? "N/A"}`);
    lines.push(`- Percentage change: ${item.pctChange ?? "N/A"}%`);
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Missing baseline data: ${baselinePath}`);
  }
  if (!fs.existsSync(optimizedPath)) {
    throw new Error(`Missing optimized data: ${optimizedPath}`);
  }

  const baseline = readJson(baselinePath);
  const optimized = readJson(optimizedPath);
  const comparisons = buildComparisons(baseline, optimized);
  const summary = {
    generatedAt: new Date().toISOString(),
    baselineSource: baselinePath,
    optimizedSource: optimizedPath,
    totals: totals(comparisons),
    comparisons,
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(markdownPath, toMarkdown(summary));

  console.log("Gas comparison summary");
  console.log(`Matched operations: ${summary.totals.matchedOperations}`);
  console.log(`Baseline total mean gas: ${summary.totals.baselineTotal}`);
  console.log(`Optimized total mean gas: ${summary.totals.optimizedTotal}`);
  console.log(`Difference: ${summary.totals.difference}`);
  console.log(`Percentage change: ${summary.totals.pctChange}%`);
  console.log(`Saved JSON summary to ${summaryPath}`);
  console.log(`Saved Markdown summary to ${markdownPath}`);
}

main();
