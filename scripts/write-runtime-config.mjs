#!/usr/bin/env node
/**
 * Writes browser-safe runtime config into the built Hosting output.
 *
 * The JS/CSS bundle is promoted from stage to production without rebuilding.
 * Per-environment public provider config lives in this non-hashed JSON file.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outputPath = resolve(outIndex >= 0 ? args[outIndex + 1] : "dist/runtime-config.json");

function readEnv(name) {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

function readBoolEnv(name) {
  const value = readEnv(name);
  if (value === undefined) return undefined;
  return value === "true";
}

const config = {
  firebaseApiKey: readEnv("VITE_FIREBASE_API_KEY"),
  firebaseAuthDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  firebaseProjectId: readEnv("VITE_FIREBASE_PROJECT_ID"),
  firebaseStorageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  firebaseMessagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  firebaseAppId: readEnv("VITE_FIREBASE_APP_ID"),
  firebaseFunctionsRegion: readEnv("VITE_FIREBASE_FUNCTIONS_REGION"),
  appCheckRecaptchaSiteKey: readEnv("VITE_APPCHECK_RECAPTCHA_SITE_KEY"),
  stravaClientId: readEnv("VITE_STRAVA_CLIENT_ID"),
  stravaRedirectUri: readEnv("VITE_STRAVA_REDIRECT_URI"),
  segmentTilesBase: readEnv("VITE_SEGMENT_TILES_BASE"),
  heatmapBase: readEnv("VITE_HEATMAP_BASE"),
  mapboxToken: readEnv("VITE_MAPBOX_TOKEN"),
  personalApiBase: readEnv("VITE_ORIDER_PERSONAL_API_BASE"),
  sentryDsn: readEnv("VITE_SENTRY_DSN"),
  appEnvironment: readEnv("VITE_MODE") ?? readEnv("MODE") ?? "production",
  useEmulators: readBoolEnv("VITE_USE_EMULATORS"),
};

const required = [
  "firebaseApiKey",
  "firebaseAuthDomain",
  "firebaseProjectId",
  "firebaseAppId",
  "stravaClientId",
  "stravaRedirectUri",
];

const missing = required.filter((key) => !config[key]);
if (missing.length > 0) {
  console.error("[write-runtime-config] missing required runtime config:");
  for (const key of missing) console.error(`  - ${key}`);
  process.exit(1);
}

const publicConfig = Object.fromEntries(
  Object.entries(config).filter(([, value]) => value !== undefined && value !== ""),
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(publicConfig, null, 2)}\n`);
console.log(`[write-runtime-config] wrote ${outputPath}`);
