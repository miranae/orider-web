#!/usr/bin/env node
/**
 * 빌드/배포 직전 필수 환경 변수 검증.
 *
 * 2026-05-13: env 누락된 채 빌드되어 `apiKey:void 0` 가 번들에 박혀 프로덕션이 다운된
 * 사고 (Firebase: auth/invalid-api-key) 가 있었음. 빌드 시 침묵으로 통과하지 않도록 가드.
 *
 * Vite 의 loadEnv 를 그대로 사용해 빌드 단계와 동일한 우선순위로 (.env, .env.<mode>,
 * process.env) 검사. 누락 시 명확한 메시지와 함께 비-제로 종료.
 *
 * 호출 위치:
 *   - web/package.json `build` 스크립트
 *   - firebase.json hosting `predeploy`
 */

import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envDir = resolve(__dirname, "..");
const mode = process.env.VITE_MODE || process.env.MODE || "production";

const env = loadEnv(mode, envDir, "");

const isProductionMode = mode === "production" || mode === "prod";

// 누락 시 앱이 절대 부팅 못하는 핵심 키. Sentry / Mapbox 등 부수 키는 선택.
const CORE_REQUIRED = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];

// 운영에서 사용자에게 노출되는 연결 기능. 값이 빠지면 버튼 클릭 시 런타임 장애가 난다.
const PRODUCTION_REQUIRED = [
  "VITE_STRAVA_CLIENT_ID",
  "VITE_STRAVA_REDIRECT_URI",
];

const REQUIRED = isProductionMode
  ? [...CORE_REQUIRED, ...PRODUCTION_REQUIRED]
  : CORE_REQUIRED;

const missing = REQUIRED.filter((k) => !env[k] || env[k].trim() === "");
if (missing.length > 0) {
  console.error("");
  console.error("[check-env] 필수 환경 변수 누락 — 빌드 중단");
  console.error(`             envDir: ${envDir}`);
  console.error(`             mode:   ${mode}`);
  console.error("             missing:");
  for (const k of missing) console.error(`               - ${k}`);
  console.error("");
  console.error("  로컬: web/.env 확인 (web/.env.example 참조)");
  console.error("  CI:   workflow secrets 확인 (.github/workflows/deploy.yml env: 블록)");
  if (missing.some((k) => PRODUCTION_REQUIRED.includes(k))) {
    console.error("");
    console.error("  운영 배포에서 Strava env 가 비면 연결 버튼이 런타임 오류를 냅니다.");
    console.error("  로컬 수동 배포 대신 GitHub Actions 태그 배포를 사용하세요.");
  }
  console.error("");
  process.exit(1);
}

console.log(`[check-env] OK (${REQUIRED.length} keys present, mode=${mode}, envDir=${envDir})`);
