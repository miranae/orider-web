#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { productionDataConfig, productionBuildEnv, resolveProductionBuildFlags, PRODUCTION_ORIGIN, verifyProductionDataCors } from "./lib/production-data-config.mjs";

const path = resolve(process.env.PRODUCTION_RUNTIME_CONFIG_PATH || ".production-runtime-config.json");
const response = await fetch(`${PRODUCTION_ORIGIN}/runtime-config.json`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`production runtime snapshot unavailable: ${response.status}`);
const config = productionDataConfig(await resolveProductionBuildFlags(await response.json()));
await verifyProductionDataCors(config);
const body = `${JSON.stringify(config, null, 2)}\n`;
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, body, { mode: 0o600 });
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, Object.entries(productionBuildEnv(config)).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
console.log(`[production-data-runtime] pinned public production config sha256=${createHash("sha256").update(body).digest("hex")}`);
