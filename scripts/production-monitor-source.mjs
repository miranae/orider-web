import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { delayUntil, successfulDeploy } from './production-monitor-lib.mjs';
// Only known production deploy workflows and their successful mutation jobs qualify.
const repo = process.env.MONITOR_SOURCE_REPO;
const id = process.env.MONITOR_SOURCE_RUN;
if (!/^[\w-]+\/[\w.-]+$/.test(repo || '') || !/^[1-9]\d*$/.test(id || '')) throw Error('invalid source');
const get = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
const run = get(`/repos/${repo}/actions/runs/${id}`);
const jobs = get(`/repos/${repo}/actions/runs/${id}/jobs?per_page=100`).jobs;
const at = successfulDeploy(run, jobs, repo);
console.log(JSON.stringify({ sourceRepository: repo, sourceRun: id, sourceSha: run.head_sha, successAt: at, dueAt: new Date(Date.parse(at) + 300000).toISOString() }));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `success_at=${at}\n`);
if (process.env.MONITOR_WAIT !== 'false') while (delayUntil(at) > 0) await wait(Math.min(30000, delayUntil(at)));
