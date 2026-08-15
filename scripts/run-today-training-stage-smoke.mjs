#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { runTodayTrainingStageSmoke } from "./lib/today-training-stage-smoke.mjs";

const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`stage_smoke:missing_${name}`); return value; };
const projectId = required("TODAY_TRAINING_STAGE_PROJECT_ID");
const app = initializeApp({ credential: applicationDefault(), projectId,
  serviceAccountId: required("TODAY_TRAINING_STAGE_SERVICE_ACCOUNT") }, `today-training-stage-${process.pid}`);
const auth = getAuth(app); const appCheck = getAppCheck(app); let appCheckToken;
async function credentialsForIdentity(uid) {
  appCheckToken ??= (await appCheck.createToken(required("TODAY_TRAINING_STAGE_APP_ID"))).token;
  const customToken = await auth.createCustomToken(uid);
  const identityEndpoint = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken";
  const identityUrl = `${identityEndpoint}?key=${encodeURIComponent(required("TODAY_TRAINING_STAGE_WEB_API_KEY"))}`;
  const response = await fetch(identityUrl, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    signal: AbortSignal.timeout(10_000),
  });
  let body;
  try {
    body = await response.json();
  } catch (cause) {
    throw new Error(`stage_smoke:id_token_exchange_json_invalid:${response.status}:${identityEndpoint}`, { cause });
  }
  if (!response.ok || typeof body.idToken !== "string") {
    throw new Error(`stage_smoke:id_token_exchange_failed:${response.status}:${identityEndpoint}`);
  }
  return { idToken: body.idToken, appCheckToken };
}
const output = process.argv[2] ?? ".artifacts/today-training-stage-smoke.json";
const evidence = await runTodayTrainingStageSmoke({ commitSha: required("TODAY_TRAINING_STAGE_COMMIT_SHA"), projectId,
  serviceUrl: required("TODAY_TRAINING_STAGE_SERVICE_URL"), eligibleUid: required("TODAY_TRAINING_STAGE_ELIGIBLE_UID"),
  ineligibleUid: required("TODAY_TRAINING_STAGE_INELIGIBLE_UID") }, { credentialsForIdentity, fetchImpl: fetch, now: Date.now });
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(`[today-training-stage-smoke] OK commit=${evidence.commitSha} project=${evidence.projectId}`);
