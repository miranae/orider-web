#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifySocialCallableContract } from "./lib/social-callable-contract.mjs";

const args = process.argv.slice(2);
const project = requiredArg("--project");
const region = requiredArg("--region");
const manifestPath = resolve(argValue("--manifest", "scripts/contracts/social-callables.json"));
const timeoutMs = Number(argValue("--timeout-ms", "10000"));
const accessToken = process.env.SOCIAL_CALLABLES_ACCESS_TOKEN ?? "";

if (!existsSync(manifestPath)) throw new Error("social callable contract manifest was not found");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const results = await verifySocialCallableContract({
  project,
  region,
  accessToken,
  manifest,
  timeoutMs,
});

for (const result of results) {
  console.log(`[social-callable-contract] ${result.name}: ACTIVE, endpoint=${result.endpoint}`);
}
console.log(`[social-callable-contract] verified ${results.length} required callables in ${project}/${region}`);

function requiredArg(name) {
  const value = argValue(name, "");
  if (!value || value.startsWith("-")) throw new Error(`${name} is required`);
  return value;
}

function argValue(name, fallback) {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("-") ? value : fallback;
}
