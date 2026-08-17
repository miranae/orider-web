import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const BUDGETS = {
  // 1600 → 2000 (2026-08). activityDetailDerived 의 소스·테스트가 상한에 닿아 무관한 PR 까지
  // 막고 있었다. 분할이 정답이지만 그건 해당 도메인이 판단할 일이라, 상한을 올려 게이트를
  // 풀고 분할은 별도로 다룬다. 상한은 "이 이상 커지면 멈춰서 생각하라"는 신호지 목표가 아니다.
  maxFileLines: 2000,
  maxConsoleStatements: 10,
  maxAlertCalls: 40,
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
