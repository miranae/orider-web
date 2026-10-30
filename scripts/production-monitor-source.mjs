import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { delayUntil, sourceAttemptPaths, deploymentObservation } from './production-monitor-lib.mjs';
const repo = process.env.MONITOR_SOURCE_REPO;
const id = process.env.MONITOR_SOURCE_RUN;
const attempt = process.env.MONITOR_SOURCE_ATTEMPT;
const expected = { id, attempt, sha: process.env.MONITOR_SOURCE_SHA, conclusion: process.env.MONITOR_SOURCE_CONCLUSION };
const paths = sourceAttemptPaths(repo, id, attempt);
const get = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
// Never query the run's mutable latest attempt, including while a later rerun is active.
const run = get(paths.run);
const jobs = get(paths.jobs).jobs;
const observation = deploymentObservation(run, jobs, repo, expected);
const evidence = { sourceRepository: repo, sourceRun: id, sourceAttempt: Number(attempt), ...observation };
console.log(JSON.stringify(evidence));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
  `should_check=${observation.shouldCheck}\noutcome=${observation.outcome}\ncompleted_at=${observation.completedAt || ''}\n`);
if (observation.shouldCheck && process.env.MONITOR_WAIT !== 'false') {
  while (delayUntil(observation.completedAt) > 0) await wait(Math.min(30000, delayUntil(observation.completedAt)));
}
