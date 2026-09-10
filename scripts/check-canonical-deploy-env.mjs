#!/usr/bin/env node

const CANONICAL_FLAGS = [
  "VITE_TRAINING_DECISION_CANONICAL_ENABLED",
  "VITE_CANONICAL_CONSUMERS_ENABLED",
  "VITE_CANONICAL_WEATHER",
  "VITE_CANONICAL_COURSE",
  "VITE_CANONICAL_MAINTENANCE",
  "VITE_CANONICAL_MILESTONES",
  "VITE_CANONICAL_ROLLOUT_ENABLED",
];

const invalid = CANONICAL_FLAGS.filter((name) => !["true", "false"].includes(process.env[name] ?? ""));

if (invalid.length > 0) {
  console.error("[check-canonical-deploy-env] canonical deploy flags must be explicitly set to true or false:");
  for (const name of invalid) console.error(`  - ${name}`);
  process.exit(1);
}

console.log("[check-canonical-deploy-env] OK");
