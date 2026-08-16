#!/usr/bin/env node
/**
 * Static deploy configuration guard.
 *
 * Catches production regressions that are easy to miss in a normal build:
 * - Firebase Auth popup helper origins missing from CSP.
 * - COOP too strict for Google popup login.
 * - Local deploy guard accidentally removed.
 * - Production deploy workflow no longer tag/environment gated.
 * - Self-hosted deploy jobs accidentally restore or save the shared npm cache.
 */

import { readFileSync } from "node:fs";

function fail(message) {
  console.error(`[check-deploy-config] ${message}`);
  process.exitCode = 1;
}

function requireIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) fail(`${label} must include ${needle}`);
}

function requireBefore(haystack, before, after, label) {
  const beforeIndex = haystack.indexOf(before);
  const afterIndex = haystack.indexOf(after);
  if (beforeIndex < 0 || afterIndex < 0 || beforeIndex >= afterIndex) {
    fail(`${label} must run ${before} before ${after}`);
  }
}

const firebaseConfig = JSON.parse(readFileSync("firebase.json", "utf8"));
const stageFirebaseConfig = JSON.parse(readFileSync("firebase.stage.json", "utf8"));
const PROD_AI_API_ORIGIN = "https://orider-ai-api-h5zqzw3n4a-du.a.run.app";
const STAGE_AI_API_ORIGIN = "https://orider-ai-api-stage-ldfyfyx5da-du.a.run.app";

function checkHostingConfig(hosting, label, aiApiOrigin) {
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
    const connectSrc = csp.split(";").map((directive) => directive.trim())
      .find((directive) => directive === "connect-src" || directive.startsWith("connect-src ")) ?? "";
    requireIncludes(connectSrc, aiApiOrigin, `${label} Content-Security-Policy connect-src`);
  }

  const rewrites = hosting.rewrites ?? [];
  const spaRewriteIndexes = rewrites
    .map((rule, index) => rule.destination === "/index.html" ? index : -1)
    .filter((index) => index >= 0);
  const spaRewriteIndex = spaRewriteIndexes[0] ?? -1;
  const spaRewrite = rewrites[spaRewriteIndex];
  if (spaRewriteIndexes.length !== 1 || spaRewrite?.source !== "!/@(assets)/**") {
    fail(`${label} SPA rewrite must exclude /assets/** so missing chunks return 404 instead of index.html`);
  }
  if (spaRewriteIndex !== rewrites.length - 1) {
    fail(`${label} SPA rewrite must be the final rule so no later catch-all can rewrite missing assets`);
  }
}

checkHostingConfig(firebaseConfig.hosting, "firebase.json", PROD_AI_API_ORIGIN);
checkHostingConfig(stageFirebaseConfig.hosting, "firebase.stage.json", STAGE_AI_API_ORIGIN);
if (stageFirebaseConfig.hosting?.site !== "miranae-orider-g1-stage") {
  fail("firebase.stage.json hosting.site must be miranae-orider-g1-stage");
}

const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
requireIncludes(ciWorkflow, "VITE_MAPBOX_TOKEN: ci-placeholder", "ci.yml placeholder build env");
requireIncludes(ciWorkflow, "VITE_ORIDER_AI_API_BASE: https://coach.example.run.app", "ci.yml placeholder build env");

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const runtimeConfigWriter = readFileSync("scripts/write-runtime-config.mjs", "utf8");
const envGuard = readFileSync("scripts/check-env.mjs", "utf8");
const hostingRunner = "runs-on: [self-hosted, macOS, ARM64, web-hosting]";
const selfHostedSetupNode = `- uses: actions/setup-node@v6
        with:
          node-version: 24
          package-manager-cache: false`;

function checkSelfHostedSetupNodeCache(workflow, label) {
  requireIncludes(workflow, selfHostedSetupNode, `${label} setup-node cache policy`);
  if (workflow.includes("cache: npm")) {
    fail(`${label} must not restore or save the shared npm cache on the self-hosted runner`);
  }
}
requireIncludes(runtimeConfigWriter, '  "mapboxToken",\n  "aiApiBase",', "write-runtime-config required keys");
requireIncludes(runtimeConfigWriter,
  'coachRidePlanRespondV2Enabled: readBoolEnv("VITE_COACH_RIDE_PLAN_RESPOND_V2_ENABLED") ?? false',
  "write-runtime-config Ride Plan respond-v2 default-off flag");
requireIncludes(envGuard, '"VITE_MAPBOX_TOKEN"', "check-env production required keys");
requireIncludes(deployWorkflow, "tags:", "deploy.yml trigger");
requireIncludes(deployWorkflow, '- "v*"', "deploy.yml trigger");
requireIncludes(deployWorkflow, "environment: production", "deploy.yml job");
requireIncludes(deployWorkflow, hostingRunner, "deploy.yml dedicated Hosting runner");
checkSelfHostedSetupNodeCache(deployWorkflow, "deploy.yml");
requireIncludes(deployWorkflow, "fetch-depth: 0", "deploy.yml full history checkout");
requireIncludes(deployWorkflow, "VITE_STRAVA_CLIENT_ID: ${{ secrets.VITE_STRAVA_CLIENT_ID }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_STRAVA_REDIRECT_URI: ${{ vars.VITE_STRAVA_REDIRECT_URI }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_APPCHECK_RECAPTCHA_SITE_KEY: ${{ secrets.VITE_APPCHECK_RECAPTCHA_SITE_KEY }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_MAPBOX_TOKEN: ${{ secrets.VITE_MAPBOX_TOKEN }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_ORIDER_AI_API_BASE: ${{ vars.VITE_ORIDER_AI_API_BASE }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_COACH_PMC_INSIGHT_ENABLED: ${{ vars.VITE_COACH_PMC_INSIGHT_ENABLED }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_COACH_RIDER_INSIGHT_ENABLED: ${{ vars.VITE_COACH_RIDER_INSIGHT_ENABLED }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_COACH_PROGRESS_PLANNER_ENABLED: ${{ vars.VITE_COACH_PROGRESS_PLANNER_ENABLED }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_TRAINING_DECISION_ENABLED: ${{ vars.VITE_TRAINING_DECISION_ENABLED }}", "deploy.yml env");
requireIncludes(deployWorkflow, "VITE_TRAINING_EXECUTION_ENABLED: ${{ vars.VITE_TRAINING_EXECUTION_ENABLED }}", "deploy.yml env");
for (const name of ["TOKEN", "SNAPSHOT", "AI"]) {
  requireIncludes(deployWorkflow, `VITE_COACH_RIDE_PLAN_${name}_ENABLED: \${{ vars.VITE_COACH_RIDE_PLAN_${name}_ENABLED }}`,
    "deploy.yml env");
}
requireIncludes(deployWorkflow, "VITE_COACH_RIDE_PLAN_RESPOND_V2_ENABLED: ${{ vars.VITE_COACH_RIDE_PLAN_RESPOND_V2_ENABLED }}",
  "deploy.yml env");
requireIncludes(deployWorkflow, "npm ci", "deploy.yml dependency install");
requireIncludes(deployWorkflow, "npm run build", "deploy.yml production build");
requireIncludes(deployWorkflow, "node scripts/write-runtime-config.mjs", "deploy.yml runtime config");
requireIncludes(deployWorkflow, "git fetch --no-tags origin main:refs/remotes/origin/main", "deploy.yml main provenance fetch");
requireIncludes(deployWorkflow, "git rev-list -n 1 \"$GITHUB_REF\"", "deploy.yml tagged commit resolution");
requireIncludes(deployWorkflow, "git merge-base --is-ancestor \"$release_sha\" origin/main", "deploy.yml main provenance gate");
requireBefore(deployWorkflow, "git merge-base --is-ancestor \"$release_sha\" origin/main", "npm ci", "deploy.yml main provenance gate");
requireBefore(deployWorkflow, "npm ci", "npm run build", "deploy.yml production build");
requireBefore(deployWorkflow, "npm run build", "node scripts/write-runtime-config.mjs", "deploy.yml runtime config");
requireIncludes(deployWorkflow, "node scripts/verify-social-callables.mjs", "deploy.yml backend contract gate");
requireIncludes(deployWorkflow, 'vars.VITE_FIREBASE_PROJECT_ID', "deploy.yml backend contract project");
requireIncludes(deployWorkflow, 'vars.VITE_FIREBASE_FUNCTIONS_REGION', "deploy.yml backend contract region");
requireIncludes(deployWorkflow, "SOCIAL_CALLABLES_ACCESS_TOKEN: ${{ steps.auth.outputs.access_token }}", "deploy.yml backend contract credential");
requireBefore(deployWorkflow, "node scripts/verify-social-callables.mjs", "firebase deploy --only hosting", "deploy.yml backend contract gate");
if (deployWorkflow.includes("deploy-stage.yml") || deployWorkflow.includes("gh run download") || deployWorkflow.includes("web-dist-")) {
  fail("deploy.yml must build the production artifact without a stage artifact dependency");
}

const stageDeployWorkflow = readFileSync(".github/workflows/deploy-stage.yml", "utf8");
for (const name of ["TOKEN", "SNAPSHOT", "AI"]) {
  requireIncludes(stageDeployWorkflow, `VITE_COACH_RIDE_PLAN_${name}_ENABLED: \${{ vars.STAGE_VITE_COACH_RIDE_PLAN_${name}_ENABLED }}`,
    "deploy-stage.yml env");
}
requireIncludes(stageDeployWorkflow,
  "VITE_COACH_RIDE_PLAN_RESPOND_V2_ENABLED: ${{ vars.STAGE_VITE_COACH_RIDE_PLAN_RESPOND_V2_ENABLED }}",
  "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow,
  "VITE_TRAINING_DECISION_ENABLED: ${{ vars.STAGE_VITE_TRAINING_DECISION_ENABLED }}",
  "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow,
  "VITE_TRAINING_EXECUTION_ENABLED: ${{ vars.STAGE_VITE_TRAINING_EXECUTION_ENABLED }}",
  "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "branches:", "deploy-stage.yml trigger");
requireIncludes(stageDeployWorkflow, "- main", "deploy-stage.yml trigger");
requireIncludes(stageDeployWorkflow, "environment: stage", "deploy-stage.yml job");
requireIncludes(stageDeployWorkflow, "if: github.ref == 'refs/heads/main'", "deploy-stage.yml main ref guard");
requireIncludes(stageDeployWorkflow, hostingRunner, "deploy-stage.yml dedicated Hosting runner");
checkSelfHostedSetupNodeCache(stageDeployWorkflow, "deploy-stage.yml");
requireIncludes(stageDeployWorkflow, "--config firebase.stage.json", "deploy-stage.yml deploy command");
requireIncludes(stageDeployWorkflow, "npm run write:runtime-config", "deploy-stage.yml runtime config");
requireIncludes(stageDeployWorkflow, "vars.STAGE_FIREBASE_PROJECT_ID", "deploy-stage.yml deploy command");
requireIncludes(stageDeployWorkflow, "vars.STAGE_GCP_WORKLOAD_IDENTITY_PROVIDER", "deploy-stage.yml auth");
requireIncludes(stageDeployWorkflow, "vars.STAGE_GCP_SERVICE_ACCOUNT", "deploy-stage.yml auth");
requireIncludes(stageDeployWorkflow, "id: deploy-auth", "deploy-stage.yml restored deploy auth");
requireIncludes(stageDeployWorkflow, "steps.deploy-auth.outputs.access_token", "deploy-stage.yml restored deploy credential");
requireBefore(stageDeployWorkflow, "id: deploy-auth", "firebase deploy \\", "deploy-stage.yml restored deploy auth");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_FIREBASE_API_KEY", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_FIREBASE_AUTH_DOMAIN", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_FIREBASE_PROJECT_ID", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_FIREBASE_MESSAGING_SENDER_ID", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_FIREBASE_APP_ID", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_STRAVA_CLIENT_ID", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_STRAVA_REDIRECT_URI", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_APPCHECK_RECAPTCHA_SITE_KEY", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "secrets.STAGE_VITE_MAPBOX_TOKEN", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_ORIDER_AI_API_BASE", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_COACH_PMC_INSIGHT_ENABLED", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_COACH_RIDER_INSIGHT_ENABLED", "deploy-stage.yml env");
requireIncludes(stageDeployWorkflow, "miranae-orider-g1-stage.web.app", "deploy-stage.yml verification");
requireIncludes(stageDeployWorkflow, "node scripts/verify-social-callables.mjs", "deploy-stage.yml backend contract gate");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_FIREBASE_PROJECT_ID", "deploy-stage.yml backend contract project");
requireIncludes(stageDeployWorkflow, "vars.STAGE_VITE_FIREBASE_FUNCTIONS_REGION", "deploy-stage.yml backend contract region");
requireIncludes(stageDeployWorkflow, "SOCIAL_CALLABLES_ACCESS_TOKEN: ${{ steps.auth.outputs.access_token }}", "deploy-stage.yml backend contract credential");
requireBefore(stageDeployWorkflow, "node scripts/verify-social-callables.mjs", "firebase deploy \\", "deploy-stage.yml backend contract gate");

const forbiddenStageFallbacks = [
  "secrets.VITE_FIREBASE_API_KEY",
  "vars.VITE_FIREBASE_AUTH_DOMAIN",
  "vars.VITE_FIREBASE_PROJECT_ID",
  "secrets.VITE_FIREBASE_MESSAGING_SENDER_ID",
  "secrets.VITE_FIREBASE_APP_ID",
  "secrets.VITE_STRAVA_CLIENT_ID",
  "vars.VITE_STRAVA_REDIRECT_URI",
  "secrets.VITE_APPCHECK_RECAPTCHA_SITE_KEY",
  "vars.VITE_ORIDER_AI_API_BASE",
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
