#!/usr/bin/env node
import { assertActiveFunctionResource, callableEndpointUrl, classifyCallableProbe, functionApiUrl } from "./lib/social-callable-contract.mjs";
const args = process.argv.slice(2);
const project = args[args.indexOf("--project") + 1];
const region = args[args.indexOf("--region") + 1];
if (project !== "orider-dev" || region !== "asia-northeast3") throw new Error("stage analysis contract requires orider-dev/asia-northeast3");
const token = process.env.SOCIAL_CALLABLES_ACCESS_TOKEN;
if (!token) throw new Error("stage analysis contract requires metadata access token");
const names = ["getActivityRangeAnalysis", "getMySegmentHistory", "getPowerCurvePeriods", "getActivityOverview", "getActivityStreams"];
if (process.env.VITE_TRAINING_ANALYSIS_PERIODS_ENABLED === "true") names.push("getTrainingAnalysisPeriods");
for (const functionName of names) {
  const response = await fetch(functionApiUrl(project, region, functionName), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`${functionName}: metadata HTTP ${response.status}`);
  assertActiveFunctionResource(await response.json(), { project, region, functionName });
  const probe = await fetch(callableEndpointUrl(project, region, functionName), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: {} }), redirect: "error", signal: AbortSignal.timeout(10000) });
  const result = classifyCallableProbe(probe.status, await probe.json());
  if (!result.ok) throw new Error(`${functionName}: rejection contract ${result.kind}`);
  console.log(`[stage-analysis-contract] ${functionName}: ACTIVE, unauthenticated rejected`);
}
