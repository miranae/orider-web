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
