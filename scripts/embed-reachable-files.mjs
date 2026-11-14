#!/usr/bin/env node
/**
 * 임베드 진입에서 실제로 도달하는 소스 파일 목록을 계산한다.
 *
 * 임베드(`/embed/*`)는 계정 격리를 위해 `initFirebase()` 대신 **임베드 전용 named app**
 * 을 초기화한다. 그래서 `services/firebase` 의 모듈 싱글턴(`firestore` 등)은 그 경로에서
 * 영원히 undefined 이고, 쓰는 순간 표면이 통째로 렌더되지 않는다(#847).
 *
 * ESLint 가 그 규칙을 적용할 파일 범위를 여기서 정한다 — 손으로 유지하면 새 의존이
 * 추가될 때 조용히 빠진다. 이 결함이 정확히 그렇게 샜다.
 *
 * 사용:
 *   node scripts/embed-reachable-files.mjs           # eslint-embed-scope.json 갱신
 *   node scripts/embed-reachable-files.mjs --check   # 최신인지 대조만 (CI/게이트)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { sourceImports, resolveSource } from "./review-context.mjs";

const OUT = "eslint-embed-scope.json";
const tracked = new Set(execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean));
const seen = new Set(), stack = ["src/embedded/EmbeddedBootstrapRoot.tsx"];
while (stack.length) {
  const file = stack.pop();
  if (seen.has(file) || !existsSync(file)) continue;
  seen.add(file);
  for (const edge of sourceImports(file, readFileSync(file, "utf8"))) {
    const resolved = resolveSource(file, edge.specifier, tracked);
    if (resolved && /\.[cm]?[jt]sx?$/.test(resolved)) stack.push(resolved);
  }
}
const files = [...seen].filter(f => !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f) && !f.includes("/__tests__/")).sort();
const next = `${JSON.stringify(files, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((existsSync(OUT) ? readFileSync(OUT, "utf8") : "") !== next) {
    console.error(`[embed-reachable-files] ${OUT} is stale; run node scripts/embed-reachable-files.mjs`);
    process.exit(1);
  }
  console.log(`[embed-reachable-files] current (${files.length} files)`);
} else { writeFileSync(OUT, next); console.log(`[embed-reachable-files] updated (${files.length} files)`); }
