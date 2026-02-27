/**
 * ============================================================================
 * Test Report Generator — HTML + Markdown
 * ============================================================================
 * 
 * Reads the mochawesome JSON output and generates:
 *   1. A professional custom-styled HTML report
 *   2. A Markdown summary for documentation/GitHub
 * 
 * Usage: node scripts/generate-test-report.js
 * Prereq: Run `npx hardhat test` first (generates mochawesome-report/)
 * Output: 
 *   - mochawesome-report/test-report.html  (HTML)
 *   - data/test-report.md                  (Markdown)
 */

const fs = require("fs");
const path = require("path");

const REPORT_INPUT = path.join(__dirname, "..", "mochawesome-report", "test-report.json");
const HTML_OUTPUT = path.join(__dirname, "..", "mochawesome-report", "test-report.html");
const MD_OUTPUT = path.join(__dirname, "..", "data", "test-report.md");

// ─────────────────────────────────────────────────────────────────────────────
// DATA EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

function extractTests(raw) {
    const allTests = [];

    function walkSuites(suites, category) {
        for (const suite of suites) {
            const suiteName = suite.title;
            for (const test of suite.tests || []) {
                allTests.push({
                    category,
                    suite: suiteName,
                    title: test.title,
                    pass: test.pass,
                    fail: test.fail,
                    pending: test.pending,
                    skipped: test.skipped,
                    duration: test.duration || 0,
                    err: test.err && test.err.message ? test.err.message : null,
                });
            }
            if (suite.suites && suite.suites.length > 0) {
                walkSuites(suite.suites, category);
            }
        }
    }

    for (const result of raw.results) {
        for (const suite of result.suites || []) {
            const category = suite.title;
            for (const test of suite.tests || []) {
                allTests.push({
                    category,
                    suite: category,
                    title: test.title,
                    pass: test.pass,
                    fail: test.fail,
                    pending: test.pending,
                    skipped: test.skipped,
                    duration: test.duration || 0,
                    err: test.err && test.err.message ? test.err.message : null,
                });
            }
            if (suite.suites) walkSuites(suite.suites, category);
        }
    }

    return allTests;
}

function computeStats(allTests) {
    const totalPass = allTests.filter(t => t.pass).length;
    const totalFail = allTests.filter(t => t.fail).length;
    const totalPending = allTests.filter(t => t.pending).length;
    const totalSkipped = allTests.filter(t => t.skipped).length;
    const totalTests = allTests.length;
    const passRate = totalTests > 0 ? ((totalPass / totalTests) * 100).toFixed(1) : "0.0";
    const totalDuration = allTests.reduce((sum, t) => sum + t.duration, 0);

    const categories = {};
    for (const t of allTests) {
        if (!categories[t.category]) categories[t.category] = [];
        categories[t.category].push(t);
    }

    return { totalPass, totalFail, totalPending, totalSkipped, totalTests, passRate, totalDuration, categories };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML REPORT
// ─────────────────────────────────────────────────────────────────────────────

function generateHTML(allTests, stats) {
    const { totalPass, totalFail, totalPending, totalTests, passRate, totalDuration, categories } = stats;

    // Determine type badge for each category
    function getCategoryType(name) {
        const lower = name.toLowerCase();
        if (lower.includes("security")) return { label: "Security", color: "#ef4444", bg: "rgba(239,68,68,0.1)" };
        if (lower.includes("cross") || lower.includes("integration") || lower.includes("e2e") || lower.includes("full")) return { label: "Integration", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" };
        return { label: "Unit", color: "#3b82f6", bg: "rgba(59,130,246,0.1)" };
    }

    let categoryCards = "";
    for (const [catName, tests] of Object.entries(categories)) {
        const cp = tests.filter(t => t.pass).length;
        const cf = tests.filter(t => t.fail).length;
        const ct = tests.length;
        const cd = tests.reduce((s, t) => s + t.duration, 0);
        const catType = getCategoryType(catName);
        const allPassed = cf === 0;

        let testRows = "";
        tests.forEach((t, i) => {
            let statusIcon, statusClass;
            if (t.pass) { statusIcon = "✅"; statusClass = "pass"; }
            else if (t.fail) { statusIcon = "❌"; statusClass = "fail"; }
            else if (t.pending) { statusIcon = "⚠️"; statusClass = "pending"; }
            else { statusIcon = "⏭️"; statusClass = "skip"; }

            testRows += `
        <tr class="test-row ${statusClass}">
          <td class="test-num">${i + 1}</td>
          <td class="test-name">${escapeHtml(t.title)}</td>
          <td class="test-status"><span class="status-badge ${statusClass}">${statusIcon} ${statusClass === "pass" ? "Pass" : statusClass === "fail" ? "Fail" : statusClass === "pending" ? "Pending" : "Skip"}</span></td>
          <td class="test-duration">${t.duration}ms</td>
        </tr>`;
            if (t.fail && t.err) {
                testRows += `
        <tr class="error-row"><td colspan="4"><div class="error-detail"><code>${escapeHtml(t.err)}</code></div></td></tr>`;
            }
        });

        categoryCards += `
    <div class="category-card">
      <div class="category-header" onclick="toggleCategory(this)">
        <div class="category-left">
          <span class="expand-icon">▶</span>
          <span class="category-badge" style="background:${catType.bg};color:${catType.color};border:1px solid ${catType.color}30">${catType.label}</span>
          <h3>${escapeHtml(catName)}</h3>
        </div>
        <div class="category-right">
          <span class="category-stat ${allPassed ? "stat-pass" : "stat-fail"}">${cp}/${ct} passed</span>
          <span class="category-time">${(cd / 1000).toFixed(2)}s</span>
        </div>
      </div>
      <div class="category-body collapsed">
        <table class="test-table">
          <thead><tr><th>#</th><th>Test</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>${testRows}</tbody>
        </table>
      </div>
    </div>`;
    }

    const passRateNum = parseFloat(passRate);
    const ringColor = passRateNum === 100 ? "#10b981" : passRateNum > 80 ? "#f59e0b" : "#ef4444";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Smart Contract Test Report — Medical Record System</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a25;
    --border: #2a2a3a;
    --text: #e4e4e7;
    --text-muted: #71717a;
    --accent: #6366f1;
    --accent-glow: rgba(99,102,241,0.15);
    --green: #10b981;
    --green-bg: rgba(16,185,129,0.1);
    --red: #ef4444;
    --red-bg: rgba(239,68,68,0.1);
    --yellow: #f59e0b;
    --yellow-bg: rgba(245,158,11,0.1);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
  }

  .container { max-width: 1100px; margin: 0 auto; padding: 40px 24px; }

  /* ── HEADER ── */
  .report-header {
    text-align: center;
    margin-bottom: 48px;
    padding-bottom: 32px;
    border-bottom: 1px solid var(--border);
  }
  .report-header h1 {
    font-size: 2rem;
    font-weight: 700;
    background: linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
  }
  .report-header .subtitle {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  /* ── SUMMARY DASHBOARD ── */
  .dashboard {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 32px;
    margin-bottom: 48px;
    background: var(--surface);
    border-radius: 16px;
    padding: 32px;
    border: 1px solid var(--border);
  }

  .ring-container {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ring-wrapper { position: relative; width: 140px; height: 140px; }
  .ring-wrapper svg { transform: rotate(-90deg); }
  .ring-bg { fill: none; stroke: var(--surface2); stroke-width: 10; }
  .ring-fg { fill: none; stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 1s ease; }
  .ring-label {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }
  .ring-percent { font-size: 1.8rem; font-weight: 700; display: block; }
  .ring-sub { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 16px;
    align-content: center;
  }
  .stat-card {
    background: var(--surface2);
    border-radius: 12px;
    padding: 16px 20px;
    border: 1px solid var(--border);
  }
  .stat-card .stat-value {
    font-size: 1.6rem;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
  }
  .stat-card .stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }
  .stat-card.green .stat-value { color: var(--green); }
  .stat-card.red .stat-value { color: var(--red); }
  .stat-card.yellow .stat-value { color: var(--yellow); }
  .stat-card.accent .stat-value { color: var(--accent); }

  /* ── CATEGORY CARDS ── */
  .categories-header {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 16px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 0.8rem;
  }

  .category-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .category-card:hover { border-color: var(--accent); }

  .category-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    cursor: pointer;
    user-select: none;
    transition: background 0.2s;
  }
  .category-header:hover { background: var(--surface2); }

  .category-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .expand-icon {
    font-size: 0.7rem;
    color: var(--text-muted);
    transition: transform 0.2s;
    display: inline-block;
  }
  .category-card.open .expand-icon { transform: rotate(90deg); }

  .category-badge {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .category-left h3 { font-size: 0.95rem; font-weight: 500; }

  .category-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .category-stat {
    font-size: 0.85rem;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
  }
  .stat-pass { color: var(--green); }
  .stat-fail { color: var(--red); }
  .category-time {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
  }

  /* ── TABLE ── */
  .category-body { overflow: hidden; }
  .category-body.collapsed { max-height: 0; }
  .category-body.expanded { max-height: 9999px; }

  .test-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  .test-table thead th {
    text-align: left;
    padding: 10px 16px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    background: var(--surface2);
    border-top: 1px solid var(--border);
    font-weight: 500;
  }
  .test-table tbody tr { border-top: 1px solid var(--border); }
  .test-table tbody tr:hover { background: rgba(255,255,255,0.02); }
  .test-table td { padding: 10px 16px; }

  .test-num {
    width: 40px;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
  }
  .test-name { font-weight: 400; }
  .test-status { width: 100px; }
  .test-duration {
    width: 80px;
    text-align: right;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .status-badge {
    font-size: 0.75rem;
    font-weight: 500;
  }
  .status-badge.pass { color: var(--green); }
  .status-badge.fail { color: var(--red); }
  .status-badge.pending { color: var(--yellow); }
  .status-badge.skip { color: var(--text-muted); }

  .error-row td { padding: 0 16px 10px 56px; }
  .error-detail {
    background: var(--red-bg);
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.8rem;
  }
  .error-detail code {
    font-family: 'JetBrains Mono', monospace;
    color: var(--red);
    font-size: 0.78rem;
  }

  /* ── FOOTER ── */
  .report-footer {
    text-align: center;
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .report-footer a { color: var(--accent); text-decoration: none; }

  @media (max-width: 700px) {
    .dashboard { grid-template-columns: 1fr; }
    .report-header h1 { font-size: 1.5rem; }
    .category-header { flex-direction: column; gap: 8px; align-items: flex-start; }
    .category-right { align-self: flex-end; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="report-header">
    <h1>🏥 Smart Contract Test Report</h1>
    <div class="subtitle">Medical Document Management System — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
  </div>

  <div class="dashboard">
    <div class="ring-container">
      <div class="ring-wrapper">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle class="ring-bg" cx="70" cy="70" r="60"/>
          <circle class="ring-fg" cx="70" cy="70" r="60"
            stroke="${ringColor}"
            stroke-dasharray="${2 * Math.PI * 60}"
            stroke-dashoffset="${2 * Math.PI * 60 * (1 - passRateNum / 100)}"/>
        </svg>
        <div class="ring-label">
          <span class="ring-percent" style="color:${ringColor}">${passRate}%</span>
          <span class="ring-sub">Pass Rate</span>
        </div>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card accent"><div class="stat-value">${totalTests}</div><div class="stat-label">Total Tests</div></div>
      <div class="stat-card green"><div class="stat-value">${totalPass}</div><div class="stat-label">Passing</div></div>
      <div class="stat-card red"><div class="stat-value">${totalFail}</div><div class="stat-label">Failing</div></div>
      <div class="stat-card yellow"><div class="stat-value">${totalPending}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card"><div class="stat-value">${(totalDuration / 1000).toFixed(2)}s</div><div class="stat-label">Duration</div></div>
      <div class="stat-card"><div class="stat-value">${Object.keys(categories).length}</div><div class="stat-label">Test Suites</div></div>
    </div>
  </div>

  <div class="categories-header">Test Suites</div>
  ${categoryCards}

  <div class="report-footer">
    Generated by <a href="#">generate-test-report.js</a> from mochawesome data &middot; Hardhat + Solidity 0.8.20
  </div>
</div>

<script>
  function toggleCategory(header) {
    const card = header.closest('.category-card');
    const body = card.querySelector('.category-body');
    card.classList.toggle('open');
    body.classList.toggle('collapsed');
    body.classList.toggle('expanded');
  }
</script>
</body>
</html>`;
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN REPORT
// ─────────────────────────────────────────────────────────────────────────────

function generateMarkdown(allTests, stats) {
    const { totalPass, totalFail, totalPending, totalSkipped, totalTests, passRate, totalDuration, categories } = stats;
    const lines = [];

    lines.push("# Smart Contract Test Report");
    lines.push("");
    lines.push(`> Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`);
    lines.push("");

    lines.push("## Summary");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|---|---|");
    lines.push(`| **Total Tests** | ${totalTests} |`);
    lines.push(`| ✅ **Passing** | ${totalPass} |`);
    lines.push(`| ❌ **Failing** | ${totalFail} |`);
    lines.push(`| ⚠️ **Pending** | ${totalPending} |`);
    lines.push(`| ⏭️ **Skipped** | ${totalSkipped} |`);
    lines.push(`| **Pass Rate** | ${passRate}% |`);
    lines.push(`| **Total Duration** | ${(totalDuration / 1000).toFixed(2)}s |`);
    lines.push("");

    lines.push("## Results by Category");
    lines.push("");
    lines.push("| Category | Pass | Fail | Total | Duration |");
    lines.push("|---|---|---|---|---|");
    for (const [catName, tests] of Object.entries(categories)) {
        const cp = tests.filter(t => t.pass).length;
        const cf = tests.filter(t => t.fail).length;
        const ct = tests.length;
        const cd = tests.reduce((s, t) => s + t.duration, 0);
        const icon = cf > 0 ? "❌" : "✅";
        lines.push(`| ${icon} ${catName} | ${cp} | ${cf} | ${ct} | ${(cd / 1000).toFixed(2)}s |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");

    for (const [catName, tests] of Object.entries(categories)) {
        const catPass = tests.filter(t => t.pass).length;
        const catTotal = tests.length;
        lines.push(`### ${catName} (${catPass}/${catTotal})`);
        lines.push("");
        lines.push("| # | Test | Status | Duration |");
        lines.push("|---|---|---|---|");
        tests.forEach((t, i) => {
            let status;
            if (t.pass) status = "✅ Pass";
            else if (t.fail) status = "❌ Fail";
            else if (t.pending) status = "⚠️ Pending";
            else status = "⏭️ Skip";
            lines.push(`| ${i + 1} | ${t.title} | ${status} | ${t.duration}ms |`);
        });
        lines.push("");

        const failures = tests.filter(t => t.fail && t.err);
        if (failures.length > 0) {
            lines.push("**Failures:**");
            lines.push("");
            for (const f of failures) lines.push(`- **${f.title}**: \`${f.err}\``);
            lines.push("");
        }
    }

    lines.push("---");
    lines.push("");
    lines.push("*Report generated by `scripts/generate-test-report.js` from mochawesome data.*");
    return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
    if (!fs.existsSync(REPORT_INPUT)) {
        console.error("❌ No mochawesome report found at:", REPORT_INPUT);
        console.error("   Run `npx hardhat test` first to generate the report.");
        process.exit(1);
    }

    const raw = JSON.parse(fs.readFileSync(REPORT_INPUT, "utf-8"));
    const allTests = extractTests(raw);
    const stats = computeStats(allTests);

    // HTML
    const htmlDir = path.dirname(HTML_OUTPUT);
    if (!fs.existsSync(htmlDir)) fs.mkdirSync(htmlDir, { recursive: true });
    fs.writeFileSync(HTML_OUTPUT, generateHTML(allTests, stats), "utf-8");

    // Markdown
    const mdDir = path.dirname(MD_OUTPUT);
    if (!fs.existsSync(mdDir)) fs.mkdirSync(mdDir, { recursive: true });
    fs.writeFileSync(MD_OUTPUT, generateMarkdown(allTests, stats), "utf-8");

    console.log(`\n📊 Test reports generated:`);
    console.log(`   HTML:     ${HTML_OUTPUT}`);
    console.log(`   Markdown: ${MD_OUTPUT}`);
    console.log(`   ${stats.totalPass}/${stats.totalTests} tests passing (${stats.passRate}%)`);
}

main();
