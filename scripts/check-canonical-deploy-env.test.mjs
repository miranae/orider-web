import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const flags = [
  "VITE_TRAINING_DECISION_CANONICAL_ENABLED",
  "VITE_CANONICAL_CONSUMERS_ENABLED",
  "VITE_CANONICAL_WEATHER",
  "VITE_CANONICAL_COURSE",
  "VITE_CANONICAL_MAINTENANCE",
  "VITE_CANONICAL_MILESTONES",
  "VITE_CANONICAL_ROLLOUT_ENABLED",
];

function run(values = {}) {
  const env = { ...process.env };
  for (const name of flags) delete env[name];
  return spawnSync(process.execPath, ["scripts/check-canonical-deploy-env.mjs"], {
    cwd: process.cwd(),
    env: { ...env, ...values },
    encoding: "utf8",
  });
}

test("accepts an explicit boolean value for all seven canonical deploy flags", () => {
  const result = run(Object.fromEntries(flags.map((name, index) => [name, index % 2 ? "true" : "false"])));
  assert.equal(result.status, 0, result.stderr);
});

test("rejects missing and non-boolean canonical deploy flags", () => {
  const values = Object.fromEntries(flags.map((name) => [name, "false"]));
  delete values.VITE_CANONICAL_COURSE;
  values.VITE_CANONICAL_ROLLOUT_ENABLED = "1";

  const result = run(values);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /VITE_CANONICAL_COURSE/);
  assert.match(result.stderr, /VITE_CANONICAL_ROLLOUT_ENABLED/);
});
