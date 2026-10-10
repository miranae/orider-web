#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { checkIsolatedStageConfig } from "./lib/isolated-stage-config.mjs";
if (process.env.STAGE_FIREBASE_PROJECT_ID && process.env.STAGE_FIREBASE_PROJECT_ID !== "orider-dev") throw new Error("stage Hosting project must be orider-dev");
const hosting = JSON.parse(readFileSync("firebase.stage.json", "utf8")).hosting;
if (hosting.site !== "orider-dev" || hosting.rewrites.some(rule => rule.function || rule.run)) throw new Error("isolated stage Hosting must have no server rewrites");
checkIsolatedStageConfig({
  appEnvironment: process.env.VITE_MODE,
  firebaseProjectId: process.env.VITE_FIREBASE_PROJECT_ID,
  firebaseAuthDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  firebaseStorageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  firebaseAppId: process.env.VITE_FIREBASE_APP_ID,
  firebaseMessagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  firebaseFunctionsRegion: process.env.VITE_FIREBASE_FUNCTIONS_REGION,
  aiApiBase: process.env.VITE_ORIDER_AI_API_BASE,
  personalApiBase: process.env.VITE_ORIDER_PERSONAL_API_BASE,
  segmentTilesBase: process.env.VITE_SEGMENT_TILES_BASE,
  heatmapBase: process.env.VITE_HEATMAP_BASE,
  stravaRedirectUri: process.env.VITE_STRAVA_REDIRECT_URI,
  useEmulators: process.env.VITE_USE_EMULATORS === "true",
});
console.log("[isolated-stage] project, app, Storage and service identities verified");
