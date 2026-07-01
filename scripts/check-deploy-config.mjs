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

const stageDeployWorkflow = readFileSync(".github/workflows/deploy-stage.yml", "utf8");
requireIncludes(stageDeployWorkflow, "branches:", "deploy-stage.yml trigger");
requireIncludes(stageDeployWorkflow, "- main", "deploy-stage.yml trigger");
requireIncludes(stageDeployWorkflow, "environment: stage", "deploy-stage.yml job");
requireIncludes(stageDeployWorkflow, "--config firebase.stage.json", "deploy-stage.yml deploy command");
requireIncludes(stageDeployWorkflow, "miranae-orider-g1-stage.web.app", "deploy-stage.yml verification");

if (process.exitCode) process.exit(process.exitCode);
console.log("[check-deploy-config] OK");
