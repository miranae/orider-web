import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, delayUntil, deploymentObservation, sourceAttemptPaths, isFeedApiUrl, isAppCheckUrl, isCompletedListenerCancellation, assertDeploymentCheckpoint } from './production-monitor-lib.mjs';
const healthy = { httpStatus: 200, rootVisible: true, cards: 3, cardContentVisible: true };
test('rendered shell and HTTP 200 do not prove a feed', () => {
  assert.equal(classify({ ...healthy, cards: 0 }), 'feed_timeout');
  assert.equal(classify(healthy), 'healthy_cards');
  assert.equal(classify({ ...healthy, cardContentVisible: false }), 'feed_timeout');
});
test('empty requires successful data contract plus explicit UI', () => {
  assert.equal(classify({ ...healthy, cards: 0, emptyVisible: true }), 'unverified_empty');
  assert.equal(classify({ ...healthy, cards: 0, emptyVisible: true, verifiedEmpty: true }), 'healthy_empty');
  assert.equal(classify({ ...healthy, cards: 0, emptyVisible: true, verifiedEmpty: true, apiErrors: ['401'] }), 'api_error');
});
test('API, boot and chunk failures win over stale cards', () => {
  assert.equal(classify({ ...healthy, feedAlert: true }), 'api_error');
  assert.equal(classify({ ...healthy, chunkErrors: ['404'] }), 'boot_or_chunk_error');
  assert.equal(classify({ ...healthy, pageErrors: ['boot'] }), 'boot_or_chunk_error');
  assert.equal(classify({ ...healthy, rootVisible: false }), 'boot_error');
});
test('five minutes are measured from success, not checkout or dev merge', () => {
  const at = '2026-10-27T03:00:00Z'; const now = Date.parse(at);
  assert.equal(delayUntil(at, now + 60000), 240000);
  assert.equal(delayUntil(at, now + 500000), 0);
  assert.throws(() => delayUntil('dev'), /invalid/);
  assert.throws(() => delayUntil(at, now - 1), /invalid/);
});

const sha = 'a'.repeat(40);
const event = { id: 123, attempt: 1, sha, conclusion: 'success' };
const sourceRun = { id: 123, run_attempt: 1, head_sha: sha, path: '.github/workflows/deploy.yml', event: 'push', head_branch: 'v1', status: 'completed', conclusion: 'success' };
const applyStep = { name: 'Deploy Hosting only', status: 'completed', conclusion: 'success', started_at: '2026-10-27T02:00:00Z' };
const sourceJob = { id: 456, run_id: 123, run_attempt: 1, name: 'deploy', status: 'completed', conclusion: 'success', completed_at: '2026-10-27T02:01:00Z', steps: [applyStep] };
const observe = (run = sourceRun, jobs = [sourceJob], expected = event, repo = 'miranae/orider-web') => deploymentObservation(run, jobs, repo, expected);
test('exact attempt, SHA and immutable deploy completion are pinned', () => {
  const result = observe();
  assert.equal(result.shouldCheck, true);
  assert.equal(result.completedAt, '2026-10-27T02:01:00.000Z');
  assert.equal(result.dueAt, '2026-10-27T02:06:00.000Z');
  assert.throws(() => observe({ ...sourceRun, run_attempt: 2, status: 'in_progress' }), /identity mismatch/);
  assert.throws(() => observe({ ...sourceRun, head_sha: 'b'.repeat(40) }), /identity mismatch/);
  assert.throws(() => observe(sourceRun, [{ ...sourceJob, run_attempt: 2 }]), /job attempt mismatch/);
  assert.throws(() => observe(sourceRun, [{ ...sourceJob, run_id: 999 }]), /job attempt mismatch/);
  assert.throws(() => observe({ ...sourceRun, status: 'in_progress' }), /not terminal/);
});
test('dev merges, stage, unknown sources and unfinished jobs do not qualify', () => {
  for (const patch of [{ head_branch: 'dev' }, { event: 'pull_request' }, { path: '.github/workflows/deploy-stage.yml' }]) assert.throws(() => observe({ ...sourceRun, ...patch }), /not a production/);
  assert.throws(() => observe(sourceRun, [{ ...sourceJob, status: 'in_progress' }]), /not terminal/);
  assert.equal(observe(sourceRun, [{ ...sourceJob, conclusion: 'skipped' }]).shouldCheck, false);
  assert.throws(() => sourceAttemptPaths('unknown/repo', '123', '1'));
  assert.throws(() => sourceAttemptPaths('miranae/orider-web', '../latest', '1'));
});
test('pre-apply failure and no-op success skip browser checks, even with a skipped-step timestamp', () => {
  const skipped = { ...sourceJob, steps: [{ ...applyStep, conclusion: 'skipped' }] };
  assert.equal(observe({ ...sourceRun, conclusion: 'failure' }, [{ ...skipped, conclusion: 'failure' }], { ...event, conclusion: 'failure' }).outcome, 'pre_apply_failure');
  assert.equal(observe(sourceRun, [skipped]).outcome, 'no_apply_attempt');
  assert.equal(observe({ ...sourceRun, conclusion: 'failure' }, [], { ...event, conclusion: 'failure' }).shouldCheck, false);
  const backendPreApply = { ...sourceJob, name: 'Build & Deploy to Firebase', conclusion: 'failure', steps: [{ ...applyStep, name: 'Deploy functions to Firebase (batched)', conclusion: 'skipped' }, { ...applyStep, name: 'Recover failed coordinated session-execution transition' }] };
  assert.equal(observe({ ...sourceRun, conclusion: 'failure' }, [backendPreApply], { ...event, conclusion: 'failure' }, 'miranae/orider-g1-web').shouldCheck, false);
});
test('failed, timed-out or cancelled apply attempts still get a post-completion read', () => {
  for (const conclusion of ['failure', 'timed_out', 'cancelled']) {
    const run = { ...sourceRun, conclusion };
    const job = { ...sourceJob, conclusion, steps: [{ ...applyStep, conclusion }] };
    const result = observe(run, [job], { ...event, conclusion });
    assert.equal(result.shouldCheck, true);
    assert.equal(result.outcome, 'unsuccessful_after_apply');
    assert.equal(result.dueAt, '2026-10-27T02:06:00.000Z');
  }
  // Apply succeeded, but later verification/rollback caused the deploy job to fail.
  assert.equal(observe({ ...sourceRun, conclusion: 'failure' }, [{ ...sourceJob, conclusion: 'failure' }], { ...event, conclusion: 'failure' }).shouldCheck, true);
});
test('backend tag and fast lanes require the actual apply/transition step', () => {
  const repo = 'miranae/orider-g1-web';
  const tagJob = { ...sourceJob, name: 'Build & Deploy to Firebase', steps: [{ ...applyStep, name: 'Deploy functions to Firebase (batched)' }] };
  assert.equal(observe(sourceRun, [tagJob], event, repo).shouldCheck, true);
  const fast = { ...sourceRun, event: 'workflow_dispatch', path: '.github/workflows/hotfix-fast-deploy.yml' };
  const fastJob = { ...sourceJob, name: 'Execute bounded production plan', steps: [{ ...applyStep, name: 'Execute plan with reverse rollback and exact readback' }] };
  assert.equal(observe(fast, [fastJob], event, repo).shouldCheck, true);
  assert.equal(observe(fast, [{ ...fastJob, steps: [{ ...applyStep, name: 'Revalidate immutable plan and current main' }] }], event, repo).shouldCheck, false);
  const closed = { ...tagJob, conclusion: 'failure', steps: [{ ...applyStep, name: 'Close session-execution cohort immediately before apply' }] };
  assert.equal(observe({ ...sourceRun, conclusion: 'failure' }, [closed], { ...event, conclusion: 'failure' }, repo).shouldCheck, true);
});
test('CLI queries only attempt-specific endpoints while a later rerun could be active', () => {
  const dir = mkdtempSync(join(tmpdir(), 'monitor-attempt-'));
  try {
    const fakeGh = join(dir, 'gh');
    const log = join(dir, 'requests');
    const output = join(dir, 'outputs');
    writeFileSync(fakeGh, `#!${process.execPath}\nconst fs=require('fs');const path=process.argv[3];fs.appendFileSync(process.env.TEST_REQUEST_LOG,path+'\\n');console.log(path.includes('/jobs?')?process.env.TEST_JOBS:process.env.TEST_RUN);\n`);
    chmodSync(fakeGh, 0o755);
    const stdout = execFileSync(process.execPath, ['scripts/production-monitor-source.mjs'], { encoding: 'utf8', env: { ...process.env,
      PATH: dir + delimiter + process.env.PATH, MONITOR_SOURCE_REPO: 'miranae/orider-web', MONITOR_SOURCE_RUN: '123',
      MONITOR_SOURCE_ATTEMPT: '1', MONITOR_SOURCE_SHA: sha, MONITOR_SOURCE_CONCLUSION: 'success', MONITOR_WAIT: 'false',
      TEST_REQUEST_LOG: log, TEST_RUN: JSON.stringify(sourceRun), TEST_JOBS: JSON.stringify({ jobs: [sourceJob] }), GITHUB_OUTPUT: output,
    } });
    assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), ['/repos/miranae/orider-web/actions/runs/123/attempts/1', '/repos/miranae/orider-web/actions/runs/123/attempts/1/jobs?per_page=100']);
    assert.equal(JSON.parse(stdout).sourceAttempt, 1);
    assert.match(readFileSync(output, 'utf8'), /should_check=true/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('API evidence uses exact hosts rather than hostname lookalikes', () => {
  for (const url of ['https://firestore.googleapis.com/x', 'https://asia-northeast3-project.cloudfunctions.net/getActivityDiscovery']) assert.equal(isFeedApiUrl(url), true);
  for (const url of ['https://firestorexgoogleapis.com/x', 'https://firestore.googleapis.com.evil.test/x', 'https://evil.test/firestore.googleapis.com', 'https://evilcloudfunctions.net/x', 'invalid']) assert.equal(isFeedApiUrl(url), false);
});

test('App Check diagnostics do not conceal or fabricate the observed feed state', () => {
  assert.equal(isAppCheckUrl('https://content-firebaseappcheck.googleapis.com/x'), true);
  assert.equal(isAppCheckUrl('https://content-firebaseappcheck.googleapis.com.evil.test/x'), false);
  assert.equal(isFeedApiUrl('https://content-firebaseappcheck.googleapis.com/x'), false);
  assert.equal(classify({ ...healthy, dependencyErrors: ['App Check 403'] }), 'healthy_cards');
  assert.equal(classify({ ...healthy, cards: 0, dependencyErrors: ['App Check 403'] }), 'feed_timeout');
  assert.equal(classify({ ...healthy, apiErrors: ['feed 403'], dependencyErrors: ['App Check 403'] }), 'api_error');
});

test('completed Firestore listener cancellation is distinct from an API transport failure', () => {
  const url = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel';
  assert.equal(isCompletedListenerCancellation(url, 'net::ERR_ABORTED'), true);
  assert.equal(isCompletedListenerCancellation(url, 'net::ERR_FAILED'), false);
  assert.equal(isCompletedListenerCancellation('https://region-project.cloudfunctions.net/getActivityDiscovery', 'net::ERR_ABORTED'), false);
  assert.equal(isCompletedListenerCancellation(url.replace('googleapis.com', 'googleapis.com.evil.test'), 'net::ERR_ABORTED'), false);
  assert.equal(classify({ ...healthy, cards: 0 }), 'feed_timeout');
});

test('checker source evidence cannot start an early or unbound deployment observation', () => {
  const result = { sourceRepository: 'miranae/orider-web', sourceRun: '123', sourceAttempt: 1, ...observe() };
  const due = Date.parse(result.dueAt);
  assert.equal(assertDeploymentCheckpoint(result, due), result);
  assert.throws(() => assertDeploymentCheckpoint(result, due - 1), /not due/);
  assert.throws(() => assertDeploymentCheckpoint({ ...result, dueAt: result.completedAt }, due));
  assert.throws(() => assertDeploymentCheckpoint({ ...result, sourceAttempt: undefined }, due));
  assert.throws(() => assertDeploymentCheckpoint({ ...result, shouldCheck: false }, due));
});
