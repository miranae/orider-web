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
import { dirname, join, normalize, relative } from "node:path";

const ROOTS = ["src/embedded/EmbeddedBootstrapRoot.tsx"];
const OUT = "eslint-embed-scope.json";

function resolve(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = normalize(join(dirname(fromFile), spec));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const seen = new Set();
const stack = [...ROOTS];
while (stack.length > 0) {
  const file = stack.pop();
  if (seen.has(file) || !existsSync(file)) continue;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  const specs = [
    ...source.matchAll(/from\s+"([^"]+)"/g),
    ...source.matchAll(/import\("([^"]+)"\)/g),
  ].map((m) => m[1]);
  for (const spec of specs) {
    const resolved = resolve(file, spec);
    if (resolved) stack.push(resolved);
  }
}

// 테스트 파일은 제외 — 싱글턴 mock 이 정상이다.
const files = [...seen]
  .map((f) => relative(process.cwd(), f))
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .sort();

const next = `${JSON.stringify(files, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== next) {
    console.error(`[embed-reachable-files] ${OUT} 가 최신이 아니다 — node scripts/embed-reachable-files.mjs 로 갱신할 것`);
    process.exit(1);
  }
  console.log(`[embed-reachable-files] 최신 (${files.length} 파일)`);
} else {
  writeFileSync(OUT, next);
  console.log(`[embed-reachable-files] ${OUT} 갱신 — ${files.length} 파일`);
}
