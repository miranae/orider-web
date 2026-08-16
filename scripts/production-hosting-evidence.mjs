#!/usr/bin/env node

import { writeFileSync } from "node:fs";

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const FIREBASE_ID = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const ENTRY_ASSET = /^assets\/index-[A-Za-z0-9_-]+\.js$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function requireMatch(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

export function createProductionHostingEvidence(input, now = new Date()) {
  const {
    commitSha,
    workflowRunId,
    workflowRunAttempt,
    projectId,
    site,
    builtEntryAsset,
    builtEntrySha256,
    liveEntryAsset,
    liveEntrySha256,
    liveCacheControl,
  } = input;
  requireMatch(commitSha, COMMIT_SHA, "commitSha");
  requireMatch(workflowRunId, POSITIVE_DECIMAL, "workflowRunId");
  requireMatch(workflowRunAttempt, POSITIVE_DECIMAL, "workflowRunAttempt");
  requireMatch(projectId, FIREBASE_ID, "projectId");
  requireMatch(site, FIREBASE_ID, "site");
  requireMatch(builtEntryAsset, ENTRY_ASSET, "builtEntryAsset");
  requireMatch(liveEntryAsset, ENTRY_ASSET, "liveEntryAsset");
  requireMatch(builtEntrySha256, SHA256, "builtEntrySha256");
  requireMatch(liveEntrySha256, SHA256, "liveEntrySha256");
  if (builtEntryAsset !== liveEntryAsset || builtEntrySha256 !== liveEntrySha256) {
    throw new Error("built and live entry bundles must match exactly");
  }
  if (typeof liveCacheControl !== "string" || /[\r\n]/.test(liveCacheControl) || !/\bimmutable\b/i.test(liveCacheControl)) {
    throw new Error("liveCacheControl must include immutable");
  }

  const generatedAt = now.toISOString();
  requireMatch(generatedAt, ISO_TIMESTAMP, "generatedAt");
  return {
    schemaVersion: "production-hosting-evidence-v1",
    repository: "miranae/orider-web",
    commitSha,
    workflowRunId,
    workflowRunAttempt,
    projectId,
    site,
    builtEntryAsset,
    builtEntrySha256,
    liveEntryAsset,
    liveEntrySha256,
    liveCacheControl,
    generatedAt,
  };
}

function parseArgs(argv) {
  const expected = new Set([
    "output", "commit-sha", "workflow-run-id", "workflow-run-attempt", "project-id", "site",
    "built-entry-asset", "built-entry-sha256", "live-entry-asset", "live-entry-sha256", "live-cache-control",
  ]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!key || !expected.has(key) || value === undefined || key in values) {
      throw new Error("expected each evidence argument exactly once");
    }
    values[key] = value;
  }
  if (Object.keys(values).length !== expected.size) throw new Error("missing evidence argument");
  return values;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const values = parseArgs(process.argv.slice(2));
    const evidence = createProductionHostingEvidence({
      commitSha: values["commit-sha"],
      workflowRunId: values["workflow-run-id"],
      workflowRunAttempt: values["workflow-run-attempt"],
      projectId: values["project-id"],
      site: values.site,
      builtEntryAsset: values["built-entry-asset"],
      builtEntrySha256: values["built-entry-sha256"],
      liveEntryAsset: values["live-entry-asset"],
      liveEntrySha256: values["live-entry-sha256"],
      liveCacheControl: values["live-cache-control"],
    });
    writeFileSync(values.output, `${JSON.stringify(evidence)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch (error) {
    console.error(`[production-hosting-evidence] ${error.message}`);
    process.exitCode = 1;
  }
}
