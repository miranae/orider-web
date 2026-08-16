import assert from "node:assert/strict";
import test from "node:test";

import { createProductionHostingEvidence } from "./production-hosting-evidence.mjs";

const validInput = {
  commitSha: "a".repeat(40),
  workflowRunId: "123456789",
  workflowRunAttempt: "2",
  projectId: "miranae-orider-g1",
  site: "miranae-orider-g1",
  builtEntryAsset: "assets/index-abc_123.js",
  builtEntrySha256: "b".repeat(64),
  liveEntryAsset: "assets/index-abc_123.js",
  liveEntrySha256: "b".repeat(64),
  liveCacheControl: "public, max-age=31536000, immutable",
};

test("writes only the canonical production Hosting evidence fields", () => {
  assert.deepEqual(createProductionHostingEvidence(validInput, new Date("2026-08-16T09:00:00.000Z")), {
    schemaVersion: "production-hosting-evidence-v1",
    repository: "miranae/orider-web",
    ...validInput,
    generatedAt: "2026-08-16T09:00:00.000Z",
  });
});

test("rejects mismatched bundle evidence and unsafe cache headers", () => {
  assert.throws(() => createProductionHostingEvidence({
    ...validInput,
    liveEntrySha256: "c".repeat(64),
  }), /bundles must match exactly/);
  assert.throws(() => createProductionHostingEvidence({
    ...validInput,
    liveCacheControl: "public\r\nAuthorization: secret",
  }), /must include immutable/);
});
