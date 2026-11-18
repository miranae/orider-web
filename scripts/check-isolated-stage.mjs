#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { checkIsolatedStageConfig } from "./lib/isolated-stage-config.mjs";
import { productionDataConfig } from "./lib/production-data-config.mjs";
import { stageProductionParityConfig } from "./lib/stage-production-parity.mjs";
import { readPinnedProductionRuntime } from "./lib/production-release-attestation.mjs";
import { isDeepStrictEqual } from "node:util";
if (process.env.STAGE_FIREBASE_PROJECT_ID && process.env.STAGE_FIREBASE_PROJECT_ID !== "orider-dev") throw new Error("stage Hosting project must be orider-dev");
const hosting = JSON.parse(readFileSync("firebase.stage.json", "utf8")).hosting;
if (hosting.site !== "orider-dev" || hosting.rewrites.some(rule => rule.function || rule.run)) throw new Error("isolated stage Hosting must have no server rewrites");
if (process.env.STAGE_PARITY_PRODUCTION_RUNTIME_PATH && process.env.PRODUCTION_RUNTIME_CONFIG_PATH) throw new Error("stage parity and production runtime sources are mutually exclusive");
if (process.env.STAGE_PARITY_PRODUCTION_RUNTIME_PATH) {
  const source = JSON.parse(readFileSync(process.env.STAGE_PARITY_PRODUCTION_RUNTIME_PATH, "utf8"));
  if (!process.env.STAGE_PARITY_SOURCE_SHA || !process.env.STAGE_PARITY_HOSTING_VERSION) throw new Error("stage parity requires the prepared production SHA and Hosting version");
  stageProductionParityConfig(source, { sourceSha: process.env.STAGE_PARITY_SOURCE_SHA, hostingVersion: process.env.STAGE_PARITY_HOSTING_VERSION });
  const live = await readPinnedProductionRuntime(process.env.STAGE_PARITY_SOURCE_SHA);
  if (live.release.version !== process.env.STAGE_PARITY_HOSTING_VERSION || !isDeepStrictEqual(source, live.source)) throw new Error("prepared production runtime or Hosting version is stale");
  console.log("[development-hosting] production version, shared data and isolated compute verified");
  process.exit(0);
}
if (process.env.PRODUCTION_RUNTIME_CONFIG_PATH) {
  productionDataConfig(JSON.parse(readFileSync(process.env.PRODUCTION_RUNTIME_CONFIG_PATH, "utf8")));
  console.log("[development-hosting] production data snapshot and development Hosting verified");
  process.exit(0);
}
checkIsolatedStageConfig({
  appEnvironment: process.env.VITE_MODE,
  firebaseProjectId: process.env.VITE_FIREBASE_PROJECT_ID,
  firebaseAuthDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  firebaseStorageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  firebaseAppId: process.env.VITE_FIREBASE_APP_ID,
  firebaseMessagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  firebaseFunctionsBase: process.env.VITE_FIREBASE_FUNCTIONS_BASE,
  socialAuthFunctionsBase: process.env.VITE_SOCIAL_AUTH_FUNCTIONS_BASE,
  firebaseFunctionsRegion: process.env.VITE_FIREBASE_FUNCTIONS_REGION,
  aiApiBase: process.env.VITE_ORIDER_AI_API_BASE,
  personalApiBase: process.env.VITE_ORIDER_PERSONAL_API_BASE,
  segmentTilesBase: process.env.VITE_SEGMENT_TILES_BASE,
  stravaRedirectUri: process.env.VITE_STRAVA_REDIRECT_URI,
  useEmulators: process.env.VITE_USE_EMULATORS === "true",
});
console.log("[isolated-stage] project, app, Storage and service identities verified");
