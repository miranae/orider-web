#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { verifyPublicClubApi } from "./lib/public-club-deploy-config.mjs";
const args = process.argv.slice(2);
const runtime = args.indexOf("--runtime"), origin = args.indexOf("--origin");
if (runtime < 0 || origin < 0 || args.length !== 4 || !args[runtime + 1] || !args[origin + 1]) throw new Error("usage: --runtime file --origin approved-origin");
const result = await verifyPublicClubApi(JSON.parse(readFileSync(args[runtime + 1], "utf8")), args[origin + 1]);
console.log(`[public-club-deploy] response boundary ready; count=${result.clubCount}`);
