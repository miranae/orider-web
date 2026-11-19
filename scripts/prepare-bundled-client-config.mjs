#!/usr/bin/env node
// 검증한 원본 설정에서 환경별 공통 실행 구성을 생성한다. 원격 설정은 변경하지 않는다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { bundledFunctionsConfig, bundledHostingConfig } from "./lib/bundled-functions-config.mjs";
const args = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  if (!["--source", "--environment", "--output"].includes(key) || !process.argv[index + 1] || args[key]) throw new Error("source/environment/output required");
  args[key] = process.argv[index + 1];
}
if (Object.keys(args).length !== 3) throw new Error("source/environment/output required");
const runtime = bundledFunctionsConfig(JSON.parse(readFileSync(resolve(args["--source"]), "utf8")), args["--environment"]);
const hosting = bundledHostingConfig(JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8")), args["--environment"]);
const output = resolve(args["--output"]);
mkdirSync(output, { mode: 0o700 });
for (const [name, value] of [["runtime-config.json", runtime], ["firebase.json", hosting]]) {
  writeFileSync(resolve(output, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}
process.stdout.write(`${JSON.stringify({ environment: args["--environment"], prepared: true, deployed: false })}\n`);
