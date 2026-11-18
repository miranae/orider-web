#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { stageHtmlEntry } from "./lib/stage-artifact-manifest.mjs";
if (process.argv.length !== 3) throw new Error("stage HTML file required");
const path = process.argv[2];
let html;
try { html = readFileSync(path, "utf8"); } catch { throw new Error(`stage HTML unreadable at ${path}`); }
console.log(stageHtmlEntry(html, path));
