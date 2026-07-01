#!/usr/bin/env node
/**
 * Static deploy configuration guard.
 *
 * Catches production regressions that are easy to miss in a normal build:
 * - Firebase Auth popup helper origins missing from CSP.
 * - COOP too strict for Google popup login.
 * - Local deploy guard accidentally removed.
 * - Production deploy workflow no longer tag/environment gated.
 */

import { readFileSync } from "node:fs";

function fail(message) {
  console.error(`[check-deploy-config] ${message}`);
  process.exitCode = 1;
}

function requireIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) fail(`${label} must include ${needle}`);
}

const firebaseConfig = JSON.parse(readFileSync("firebase.json", "utf8"));
const stageFirebaseConfig = JSON.parse(readFileSync("firebase.stage.json", "utf8"));

function checkHostingConfig(hosting, label) {
  if (!hosting) {
    fail(`${label} must contain hosting config`);
    return;
  }

  const predeploy = Array.isArray(hosting.predeploy) ? hosting.predeploy.join(" && ") : String(hosting.predeploy ?? "");
  requireIncludes(predeploy, "scripts/predeploy-guard.mjs", `${label} hosting.predeploy`);
  requireIncludes(predeploy, "scripts/check-env.mjs", `${label} hosting.predeploy`);
  requireIncludes(predeploy, "scripts/write-runtime-config.mjs", `${label} hosting.predeploy`);

  const globalHeaderRule = hosting.headers?.find((rule) => rule.source === "**");
  if (!globalHeaderRule) {
    fail(`${label} hosting.headers must contain a global ** rule`);
  } else {
    const headerMap = new Map(globalHeaderRule.headers.map((h) => [h.key.toLowerCase(), h.value]));
    const coop = headerMap.get("cross-origin-opener-policy");
    if (coop !== "unsafe-none") {
      fail(`${label} Cross-Origin-Opener-Policy must be unsafe-none for Firebase Google popup auth, got ${coop ?? "<missing>"}`);
    }

    const csp = headerMap.get("content-security-policy") ?? "";
    requireIncludes(csp, "script-src", `${label} Content-Security-Policy`);
    requireIncludes(csp, "https://apis.google.com", `${label} Content-Security-Policy script-src`);
    requireIncludes(csp, "frame-src", `${label} Content-Security-Policy`);
    requireIncludes(csp, "https://*.firebaseapp.com", `${label} Content-Security-Policy frame-src`);
    requireIncludes(csp, "https://www.google.com", `${label} Content-Security-Policy frame-src`);
    requireIncludes(csp, "https://www.recaptcha.net", `${label} Content-Security-Policy frame-src`);
  }
}

checkHostingConfig(firebaseConfig.hosting, "firebase.json");
checkHostingConfig(stageFirebaseConfig.hosting, "firebase.stage.json");
if (stageFirebaseConfig.hosting?.site !== "miranae-orider-g1-stage") {
  fail("firebase.stage.json hosting.site must be miranae-orider-g1-stage");
}

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
requireIncludes(deployWorkflow, "tags:", "deploy.yml trigger");
requireIncludes(deployWorkflow, '- "v*"', "deploy.yml trigger");
requireIncludes(deployWorkflow, "environment: production", "deploy.yml job");
requireIncludes(deployWorkflow, "VITE_STRAVA_CLIENT_ID: ${{ secrets.VITE_STRAVA_CLIENT_ID }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_STRAVA_REDIRECT_URI: ${{ vars.VITE_STRAVA_REDIRECT_URI }}", "deploy.yml env");
requireIncludes(deployWorkflow, "actions: read", "deploy.yml permissions");
requireIncludes(deployWorkflow, "gh run download", "deploy.yml promotion");
requireIncludes(deployWorkflow, "node scripts/write-runtime-config.mjs", "deploy.yml runtime config");
if (deployWorkflow.includes("npm run build")) {
  fail("deploy.yml must promote the verified stage artifact without npm run build");
}

const stageDeployWorkflow = readFileSync(".github/workflows/deploy-stage.yml", "utf8");
requireIncludes(stageDeployWorkflow, "branches:", "deploy-stage.yml trigger");
requireIncludes(stageDeployWorkflow, "- main", "deploy-stage.yml trigger");
requireIncludes(stageDeployWorkflow, "environment: stage", "deploy-stage.yml job");
requireIncludes(stageDeployWorkflow, "--config firebase.stage.json", "deploy-stage.yml deploy command");
requireIncludes(stageDeployWorkflow, "npm run write:runtime-config", "deploy-stage.yml runtime config");
requireIncludes(stageDeployWorkflow, "actions/upload-artifact", "deploy-stage.yml verified artifact upload");
requireIncludes(stageDeployWorkflow, "vars.STAGE_FIREBASE_PROJECT_ID", "deploy-stage.yml deploy command");
requireIncludes(stageDeployWorkflow, "vars.STAGE_GCP_WORKLOAD_IDENTITY_PROVIDER", "deploy-stage.yml auth");
requireIncludes(stageDeployWorkflow, "vars.STAGE_GCP_SERVICE_ACCOUNT", "deploy-stage.yml auth");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_FIREBASE_API_KEY", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_FIREBASE_AUTH_DOMAIN", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_FIREBASE_PROJECT_ID", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_FIREBASE_MESSAGING_SENDER_ID", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_FIREBASE_APP_ID", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_STRAVA_CLIENT_ID", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_STRAVA_REDIRECT_URI", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_APPCHECK_RECAPTCHA_SITE_KEY", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "miranae-orider-g1-stage.web.app", "deploy-stage.yml verification");

const forbiddenStageFallbacks = [
  "secrets.VITE_FIREBASE_API_KEY",
  "vars.VITE_FIREBASE_AUTH_DOMAIN",
  "vars.VITE_FIREBASE_PROJECT_ID",
  "secrets.VITE_FIREBASE_MESSAGING_SENDER_ID",
  "secrets.VITE_FIREBASE_APP_ID",
  "secrets.VITE_STRAVA_CLIENT_ID",
  "vars.VITE_STRAVA_REDIRECT_URI",
  "secrets.VITE_APPCHECK_RECAPTCHA_SITE_KEY",
  "vars.FIREBASE_PROJECT_ID",
  "vars.GCP_WORKLOAD_IDENTITY_PROVIDER",
  "vars.GCP_SERVICE_ACCOUNT",
];

for (const forbidden of forbiddenStageFallbacks) {
  if (stageDeployWorkflow.includes(forbidden)) {
    fail(`deploy-stage.yml must use STAGE_* values only; remove ${forbidden}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("[check-deploy-config] OK");
