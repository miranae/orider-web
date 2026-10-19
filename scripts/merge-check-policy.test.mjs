import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateChecks, validateMergeState } from './merge-check-policy.mjs';

const head = 'a'.repeat(40);
const repository = 'miranae/orider-web';
const check = { name: 'Analyze (actions)', head_sha: head, status: 'queued', conclusion: null,
  app: { id: 15368, slug: 'github-actions' }, check_suite: { id: 10 },
  details_url: `https://github.com/${repository}/actions/runs/20/job/30` };
const run = { id: 20, head_sha: head, check_suite_id: 10, name: 'PR #1237', path: 'dynamic/github-code-scanning/codeql' };
const base = { head, repository, workflows: { 20: run }, statuses: [] };
const evaluate = (checks, extra = {}) => evaluateChecks({ ...base, checks, ...extra });

test('queued or failed genuine dynamic CodeQL does not block', () => {
  for (const item of [check, { ...check, status: 'completed', conclusion: 'failure' }]) {
    assert.deepEqual(evaluate([item]), { state: 'pass', reasons: [], ignored: [check.name] });
  }
});
test('dedicated security app CodeQL and conventional CodeQL workflow are recognized', () => {
  assert.equal(evaluate([{ ...check, name: 'CodeQL', app: { id: 57789, slug: 'github-advanced-security' } }]).state, 'pass');
  assert.equal(evaluate([check], { workflows: { 20: { ...run, name: 'CodeQL', path: '.github/workflows/codeql.yml' } } }).ignored.length, 1);
});
test('ordinary failure, cancellation and unknown states still block', () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required', null, 'unknown']) {
    assert.equal(evaluate([{ ...check, name: 'Build', status: 'completed', conclusion }], { workflows: {} }).state, 'blocked');
  }
});
test('ordinary pending checks wait, while passed/neutral/skipped checks pass', () => {
  assert.equal(evaluate([check], { workflows: {} }).state, 'pending');
  for (const conclusion of ['success', 'neutral', 'skipped']) {
    assert.equal(evaluate([{ ...check, status: 'completed', conclusion }], { workflows: {} }).state, 'pass');
  }
});
test('CodeQL name alone or wrong app cannot bypass', () => {
  for (const app of [{ id: 42, slug: 'github-actions' }, { id: 15368, slug: 'spoof' }, { id: 42, slug: 'github-advanced-security' }]) {
    const result = evaluate([{ ...check, name: 'CodeQL', app, status: 'completed', conclusion: 'failure' }]);
    assert.equal(result.state, 'blocked');
    assert.equal(result.ignored.length, 0);
  }
});
test('run head, suite, ID, repo URL and workflow path identity must all match', () => {
  for (const patch of [{ head_sha: 'b'.repeat(40) }, { check_suite_id: 11 }, { id: 21 }, { path: '.github/workflows/build.yml', name: 'CodeQL' }]) {
    assert.equal(evaluate([check], { workflows: { 20: { ...run, ...patch } } }).state, 'pending');
  }
  assert.equal(evaluate([{ ...check, details_url: 'https://github.com/evil/repo/actions/runs/20/job/30' }]).state, 'pending');
});
test('missing input, app metadata or stale check head fails closed', () => {
  assert.equal(evaluateChecks({}).state, 'blocked');
  for (const patch of [{ app: null }, { app: { slug: 'github-actions' } }, { head_sha: 'b'.repeat(40) }]) {
    assert.equal(evaluate([{ ...check, ...patch }]).state, 'blocked');
  }
});
test('commit statuses cannot use CodeQL context to bypass and latest retry wins', () => {
  assert.equal(evaluate([], { statuses: [{ context: 'CodeQL', state: 'failure' }] }).state, 'blocked');
  assert.equal(evaluate([], { statuses: [{ context: 'test', state: 'pending' }] }).state, 'pending');
  assert.equal(evaluate([], { statuses: [{ context: 'test', state: 'success' }, { context: 'test', state: 'failure' }] }).state, 'pass');
});
test('merge fences retain exact head, open/non-draft and conflict/protection states', () => {
  const meta = { headRefOid: head, state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' };
  assert.equal(validateMergeState(meta, head), null);
  assert.equal(validateMergeState({ ...meta, mergeStateStatus: 'UNSTABLE' }, head, 1), null);
  assert.ok(validateMergeState({ ...meta, mergeStateStatus: 'UNSTABLE' }, head));
  for (const patch of [{ headRefOid: 'b'.repeat(40) }, { state: 'CLOSED' }, { isDraft: true }, { mergeable: 'CONFLICTING' }, { mergeable: 'UNKNOWN' }, ...['BLOCKED', 'BEHIND', 'DIRTY', 'UNKNOWN', null].map(mergeStateStatus => ({ mergeStateStatus }))]) {
    assert.ok(validateMergeState({ ...meta, ...patch }, head, 1));
  }
});

test('CLI gate reads every page, rejects no-wait pending and waits ordinary checks when requested', async () => {
  const { runGate } = await import('./merge-check-policy.mjs');
  const calls = [];
  let tick = 0;
  const query = (...args) => {
    calls.push(args);
    if (args[0] === 'repo') return { nameWithOwner: repository };
    if (args[0] === 'pr') return { headRefOid: head, state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'UNSTABLE' };
    const endpoint = args.at(-1);
    if (endpoint.includes('/check-runs?')) return [{ check_runs: [check] }, { check_runs: [{ ...check, name: 'Tests', app: { id: 2, slug: 'ci' }, status: tick ? 'completed' : 'queued', conclusion: tick ? 'success' : null }] }];
    if (endpoint.includes('/statuses?')) return [[], [{ context: 'external', state: tick ? 'success' : 'pending' }]];
    if (endpoint.endsWith('/runs/20')) return run;
    throw new Error(`Unexpected API ${args}`);
  };
  await assert.rejects(runGate('1237', head, false, { query }), /CodeQL 이외/);
  await runGate('1237', head, true, { query, pause: async ms => { assert.equal(ms, 10000); tick++; } });
  assert.equal(tick, 1);
  for (const call of calls.filter(args => args.at(-1).includes('/check-runs?') || args.at(-1).includes('/statuses?'))) {
    assert.ok(call.includes('--paginate'));
    assert.ok(call.includes('--slurp'));
  }
  assert.ok(calls.some(args => args.at(-1).includes('filter=latest&per_page=100')));
});

test('CLI rejects PR head drift even when only CodeQL checks exist', async () => {
  const { runGate } = await import('./merge-check-policy.mjs');
  const query = (...args) => {
    if (args[0] === 'repo') return { nameWithOwner: repository };
    if (args[0] === 'pr') return { headRefOid: 'b'.repeat(40), state: 'OPEN', isDraft: false };
    if (args.at(-1).includes('/check-runs?')) return [{ check_runs: [check] }];
    if (args.at(-1).includes('/statuses?')) return [[]];
    return run;
  };
  await assert.rejects(runGate('1237', head, false, { query }), /head 변경/);
});
