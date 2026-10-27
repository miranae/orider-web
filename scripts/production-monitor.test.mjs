import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, delayUntil, successfulDeploy, isFeedApiUrl, isAppCheckUrl, isCompletedListenerCancellation } from './production-monitor-lib.mjs';
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

test('deploy source rejects dev merges, rehearsal, failed and skipped mutation jobs', () => {
  const run = { path: '.github/workflows/deploy.yml', event: 'push', head_branch: 'v1', conclusion: 'success' };
  const job = { name: 'deploy', status: 'completed', conclusion: 'success', completed_at: '2026-10-27T02:00:00Z' };
  assert.equal(successfulDeploy(run, [job], 'miranae/orider-web'), job.completed_at);
  for (const patch of [{ head_branch: 'dev' }, { event: 'pull_request' }, { conclusion: 'failure' }, { path: '.github/workflows/deploy-stage.yml' }]) assert.throws(() => successfulDeploy({ ...run, ...patch }, [job], 'miranae/orider-web'));
  assert.throws(() => successfulDeploy(run, [{ ...job, conclusion: 'skipped' }], 'miranae/orider-web'));
  assert.equal(successfulDeploy(run, [{ ...job, name: 'Build & Deploy to Firebase' }], 'miranae/orider-g1-web'), job.completed_at);
  assert.equal(successfulDeploy({ ...run, path: '.github/workflows/hotfix-fast-deploy.yml', event: 'workflow_dispatch' }, [{ ...job, name: 'Execute bounded production plan' }], 'miranae/orider-g1-web'), job.completed_at);
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
