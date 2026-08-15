#!/usr/bin/env node
import { readFileSync } from "node:fs";

const staged = JSON.parse(readFileSync("dist/runtime-config.json", "utf8"));
const productionDecision = process.env.VITE_TRAINING_DECISION_ENABLED === "true";
const productionExecution = process.env.VITE_TRAINING_EXECUTION_ENABLED === "true";

const missing = [];
if (productionDecision && staged.trainingDecisionEnabled !== true) missing.push("trainingDecisionEnabled");
if (productionExecution && staged.trainingExecutionEnabled !== true) missing.push("trainingExecutionEnabled");
if (productionExecution && !productionDecision) missing.push("production execution requires decision");

if (missing.length > 0) {
  console.error(`[verify-staged-training-flags] production-enabled paths were not enabled in the verified stage artifact: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("[verify-staged-training-flags] OK");
