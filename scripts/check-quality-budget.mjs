import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const BUDGETS = {
  maxFileLines: 1620,
  maxConsoleStatements: 125,
  maxAlertCalls: 48,
};

function listSourceFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const files = listSourceFiles(SRC);
const lineCounts = files.map((file) => {
  const text = readFileSync(file, "utf8");
  return {
    file: path.relative(ROOT, file),
    lines: text.split(/\r?\n/).length,
    text,
  };
});

const largest = [...lineCounts].sort((a, b) => b.lines - a.lines)[0];
const consoleCount = lineCounts.reduce(
  (sum, item) => sum + (item.text.match(/\bconsole\.(log|warn|error|info|debug)\b/g) || []).length,
  0,
);
const alertCount = lineCounts.reduce(
  (sum, item) => sum + (item.text.match(/\b(?:window\.)?alert\s*\(/g) || []).length,
  0,
);

const failures = [];
if (largest.lines > BUDGETS.maxFileLines) {
  failures.push(`largest file ${largest.file} has ${largest.lines} lines (budget ${BUDGETS.maxFileLines})`);
}
if (consoleCount > BUDGETS.maxConsoleStatements) {
  failures.push(`console.* count ${consoleCount} exceeds budget ${BUDGETS.maxConsoleStatements}`);
}
if (alertCount > BUDGETS.maxAlertCalls) {
  failures.push(`alert() count ${alertCount} exceeds budget ${BUDGETS.maxAlertCalls}`);
}

console.log("[quality-budget]");
console.log(`largest_file=${largest.file} lines=${largest.lines}/${BUDGETS.maxFileLines}`);
console.log(`console_statements=${consoleCount}/${BUDGETS.maxConsoleStatements}`);
console.log(`alert_calls=${alertCount}/${BUDGETS.maxAlertCalls}`);
console.log("largest_files:");
for (const item of [...lineCounts].sort((a, b) => b.lines - a.lines).slice(0, 10)) {
  console.log(`  ${String(item.lines).padStart(5, " ")} ${item.file}`);
}

if (failures.length > 0) {
  console.error("\nQuality budget exceeded:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
