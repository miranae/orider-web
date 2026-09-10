import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const requiredEnv = {
  VITE_FIREBASE_API_KEY: "api-key", VITE_FIREBASE_AUTH_DOMAIN: "auth.example", VITE_FIREBASE_PROJECT_ID: "project",
  VITE_FIREBASE_APP_ID: "app", VITE_APPCHECK_RECAPTCHA_SITE_KEY: "site", VITE_STRAVA_CLIENT_ID: "strava",
  VITE_STRAVA_REDIRECT_URI: "https://example.test/callback", VITE_MAPBOX_TOKEN: "map", VITE_ORIDER_AI_API_BASE: "https://ai.example",
};

function render(extraEnv = {}) {
  const directory = mkdtempSync(join(tmpdir(), "orider-runtime-config-"));
  const output = join(directory, "runtime-config.json");
  try {
    execFileSync(process.execPath, ["scripts/write-runtime-config.mjs", "--out", output], {
      cwd: process.cwd(), env: { ...process.env, ...requiredEnv, ...extraEnv }, stdio: "pipe",
    });
    return JSON.parse(readFileSync(output, "utf8"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("writes the G1 workout delivery runtime gate default-off and opt-in true", () => {
  assert.equal(render().riderWorkoutDeliveryEnabled, false);
  assert.equal(render({ VITE_RIDER_WORKOUT_DELIVERY_ENABLED: "true" }).riderWorkoutDeliveryEnabled, true);
});

test("writes the canonical consumer gates default-off and opt-in true", () => {
  const defaults = render();
  for (const key of [
    "trainingDecisionCanonicalEnabled",
    "canonicalConsumersEnabled",
    "canonicalWeatherEnabled",
    "canonicalCourseEnabled",
    "canonicalMaintenanceEnabled",
    "canonicalMilestonesEnabled",
    "canonicalRolloutEnabled",
  ]) {
    assert.equal(defaults[key], false, `${key} must default to false`);
  }
  assert.equal(render({ VITE_CANONICAL_ROLLOUT_ENABLED: "true" }).canonicalRolloutEnabled, true);
  assert.equal(render({ VITE_CANONICAL_MILESTONES: "true" }).canonicalMilestonesEnabled, true);
});

/**
 * 런타임이 읽는 이름과 배포 산출물이 쓰는 이름이 갈리면, 플래그를 켜도 화면은 꺼진 채로 남는다
 * (2026-09-07: canonical 소비 플래그 6개가 writer 에 없어 운영에서 영원히 undefined 였다).
 * 두 파일에서 `VITE_*` 불리언 이름을 뽑아 집합으로 대조한다.
 */
test("boolean VITE flags read at runtime are all emitted by the writer", () => {
  const reader = readFileSync("src/services/runtimeConfig.ts", "utf8");
  const writer = readFileSync("scripts/write-runtime-config.mjs", "utf8");
  // 빌드 시점에만 의미가 있는 스위치 — runtime-config.json 에 실릴 값이 아니다.
  const buildOnly = new Set(["VITE_USE_BUILD_ENV_FALLBACK"]);
  const readerFlags = new Set(
    [...reader.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+) === "true"/g)]
      .map((m) => m[1])
      .filter((flag) => !buildOnly.has(flag)),
  );
  const writerFlags = new Set(
    [...writer.matchAll(/readBoolEnv\("(VITE_[A-Z0-9_]+)"\)/g)].map((m) => m[1]),
  );
  const missingInWriter = [...readerFlags].filter((flag) => !writerFlags.has(flag)).sort();
  const missingInReader = [...writerFlags].filter((flag) => !readerFlags.has(flag)).sort();
  assert.deepEqual(missingInWriter, [], `writer never emits: ${missingInWriter.join(", ")}`);
  assert.deepEqual(missingInReader, [], `runtime never reads: ${missingInReader.join(", ")}`);
});
