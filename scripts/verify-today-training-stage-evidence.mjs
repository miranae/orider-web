#!/usr/bin/env node
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const [artifactPath = ".artifacts/today-training-stage-smoke.json", expectedCommit = process.env.RELEASE_SHA,
  expectedProject = process.env.STAGE_TRAINING_PROJECT_ID] = process.argv.slice(2);
const schema = JSON.parse(readFileSync(new URL("./today-training-stage-smoke-v1.schema.json", import.meta.url), "utf8"));
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(artifact)) throw new Error(`stage_evidence:schema_invalid:${ajv.errorsText(validate.errors)}`);
if (!expectedCommit || artifact.commitSha !== expectedCommit) throw new Error("stage_evidence:commit_mismatch");
if (expectedProject && artifact.projectId !== expectedProject) throw new Error("stage_evidence:project_mismatch");
console.log(`[today-training-stage-evidence] OK commit=${artifact.commitSha} project=${artifact.projectId}`);
