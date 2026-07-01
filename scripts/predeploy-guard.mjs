#!/usr/bin/env node
/**
 * Production Hosting deploy guard.
 *
 * Firebase Hosting `predeploy` runs before both local `firebase deploy` and
 * GitHub Actions deploy. Local production deploys bypass repository secrets,
 * so they can publish a bundle built with incomplete `.env` values.
 */

const isCi = process.env.GITHUB_ACTIONS === "true";
const allowLocal = process.env.ORIDER_ALLOW_LOCAL_PROD_DEPLOY === "1";

if (isCi) {
  console.log("[predeploy-guard] OK (GitHub Actions)");
  process.exit(0);
}

if (allowLocal) {
  console.warn("[predeploy-guard] Local production deploy explicitly allowed.");
  console.warn("[predeploy-guard] Verify .env contains every production VITE_* value before continuing.");
  process.exit(0);
}

console.error("");
console.error("[predeploy-guard] 로컬 production deploy 차단");
console.error("");
console.error("  이번 사고처럼 로컬 .env 누락값이 운영 번들에 박힐 수 있습니다.");
console.error("  기본 배포 경로는 GitHub Actions 태그 배포입니다.");
console.error("");
console.error("  긴급 수동 배포가 꼭 필요하면 먼저 env 를 검증한 뒤 아래처럼 명시적으로 실행하세요:");
console.error("    npm run build");
console.error("    ORIDER_ALLOW_LOCAL_PROD_DEPLOY=1 npx firebase deploy --only hosting --project miranae-orider-g1 --non-interactive");
console.error("");
process.exit(1);
