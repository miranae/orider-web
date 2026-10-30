import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 머지 직전 PR 에 남기는 게이트 결과 기록. 로컬에서만 도는 게이트·AI 리뷰를 GitHub 에서
// 확인할 수 있게 한다. 실행자가 남기는 기록이라 위조 방지는 아니다(필수 CI 검사가 그 역할).
export const MARKER = "<!-- orider-merge-gate-report -->";
const FINDINGS_LIMIT = 4000;

const lines = value => String(value ?? "").split("\n").map(line => line.trim()).filter(Boolean);

function reviewSection(review, { runReview, reviewMode, rangeLabel, scope }) {
  if (!runReview) return ["- AI 리뷰: **생략** (`--no-review`)"];
  if (reviewMode === "skip") return ["- AI 리뷰: 문서 전용 변경이라 생략"];
  if (!review) return ["- AI 리뷰: **결과 없음**"];
  const attempts = (review.attempts ?? []).map(a => `${a.provider}=${a.state}${a.reason ? `(${a.reason})` : ""}`).join(", ");
  const out = [
    `- AI 리뷰: **${review.state}** — 리뷰어 \`${review.provider}\`${review.provider === "self" && review.reviewer ? ` (${review.reviewer})` : ""}`,
    `  - 시도: ${attempts || "-"}`,
    `  - 범위: \`${rangeLabel || "-"}\` · ${scope} · mode=${reviewMode}`,
  ];
  const findings = String(review.findings ?? "").trim();
  if (findings) {
    const shown = findings.length > FINDINGS_LIMIT ? `${findings.slice(0, FINDINGS_LIMIT)}\n…(${findings.length - FINDINGS_LIMIT}자 생략)` : findings;
    out.push("", "<details><summary>리뷰 지적</summary>", "", "```text", shown.replaceAll("```", "ʼʼʼ"), "```", "", "</details>");
  }
  return out;
}

export function renderGateReport(input) {
  const steps = lines(input.steps), notes = lines(input.notes);
  let review = null;
  if (input.reviewJson) { try { review = JSON.parse(input.reviewJson); } catch { review = null; } }
  const scriptLine = input.scriptHash && input.scriptHash === input.baseScriptHash
    ? `\`origin/${input.base}\` 판과 동일 (\`${input.scriptHash.slice(0, 12)}\`)`
    : `**origin/${input.base} 판과 다름** (실행 \`${String(input.scriptHash).slice(0, 12)}\`, 기준 \`${String(input.baseScriptHash || "없음").slice(0, 12)}\`)`;
  return [
    MARKER,
    `### 머지 게이트 결과 — \`${String(input.head).slice(0, 12)}\``,
    "",
    `- 실행: @${input.runner || "unknown"} · ${input.at}`,
    `- head \`${input.head}\` → base \`${input.base}\` (\`${String(input.baseSha).slice(0, 12)}\`)`,
    `- 게이트: \`${input.tier}\` · 게이트 스크립트 ${scriptLine}`,
    `- GitHub 검사 정책 통과 · reviewDecision=${input.reviewDecision || "none"} · mergeState=${input.mergeState || "unknown"}`,
    "",
    "**통과한 단계**",
    ...(steps.length ? steps.map(step => `- ✅ ${step}`) : ["- (실행한 로컬 단계 없음)"]),
    ...(notes.length ? ["", "**생략·예외**", ...notes.map(note => `- ⚠️ ${note}`)] : []),
    "",
    ...reviewSection(review, input),
    "",
    "_`scripts/merge-pr.sh` 가 머지 직전에 남긴 기록입니다._",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  process.stdout.write(renderGateReport({
    head: env.GATE_HEAD, base: env.GATE_BASE, baseSha: env.GATE_BASE_SHA, tier: env.GATE_TIER_NAME,
    runner: env.GATE_RUNNER, at: env.GATE_AT, steps: env.GATE_STEPS, notes: env.GATE_NOTES,
    scriptHash: env.GATE_SCRIPT_HASH, baseScriptHash: env.GATE_BASE_SCRIPT_HASH,
    reviewDecision: env.GATE_REVIEW_DECISION, mergeState: env.GATE_MERGE_STATE,
    runReview: env.GATE_RUN_REVIEW === "1", reviewMode: env.GATE_REVIEW_MODE, rangeLabel: env.GATE_REVIEW_RANGE,
    scope: env.GATE_REVIEW_SCOPE, reviewJson: env.GATE_REVIEW_FILE ? readFileSync(env.GATE_REVIEW_FILE, "utf8") : "",
  }) + "\n");
}
