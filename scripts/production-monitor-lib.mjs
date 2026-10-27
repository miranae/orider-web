export function delayUntil(successAt, now = Date.now()) {
  const at = Date.parse(successAt);
  if (!Number.isFinite(at) || at > now) throw Error('invalid successful deployment timestamp');
  return Math.max(0, at + 300000 - now);
}
export function classify({ httpStatus, rootVisible, cards, cardContentVisible, emptyVisible, verifiedEmpty, pageErrors = [], apiErrors = [], chunkErrors = [], feedAlert = false }) {
  if (pageErrors.length || chunkErrors.length) return 'boot_or_chunk_error';
  if (apiErrors.length || feedAlert) return 'api_error';
  if (httpStatus !== 200 || !rootVisible) return 'boot_error';
  if (cards > 0 && cardContentVisible === true) return 'healthy_cards';
  if (emptyVisible && verifiedEmpty) return 'healthy_empty';
  return emptyVisible ? 'unverified_empty' : 'feed_timeout';
}
const terminalConclusions = ['success', 'failure', 'cancelled', 'timed_out'];
function productionLane(run, repo) {
  if (repo === 'miranae/orider-web' && run.path === '.github/workflows/deploy.yml' && run.event === 'push' && /^v/.test(run.head_branch)) {
    return { job: 'deploy', apply: ['Deploy Hosting only'] };
  }
  if (repo === 'miranae/orider-g1-web' && run.path === '.github/workflows/deploy.yml' && run.event === 'push' && /^v/.test(run.head_branch)) {
    return { job: 'Build & Deploy to Firebase', apply: [
      // Recovery alone can be a pre-apply no-op; its armed path requires this close step.
      'Close session-execution cohort immediately before apply',
      'Deploy functions to Firebase (batched)', 'Deploy AI API to Cloud Run',
      'Bind and verify session-execution runtime secret before canary',
      'Verify both execution surfaces while cohort is closed, then open last',
      'Retire removed production functions after activation success',
    ] };
  }
  if (repo === 'miranae/orider-g1-web' && run.path === '.github/workflows/hotfix-fast-deploy.yml' && run.event === 'workflow_dispatch') {
    return { job: 'Execute bounded production plan', apply: ['Execute plan with reverse rollback and exact readback'] };
  }
  throw Error('not a production deployment source');
}
export function sourceAttemptPaths(repo, id, attempt) {
  if (!['miranae/orider-web', 'miranae/orider-g1-web'].includes(repo)
      || !/^[1-9]\d*$/.test(String(id)) || !/^[1-9]\d*$/.test(String(attempt))
      || !Number.isSafeInteger(Number(id)) || !Number.isSafeInteger(Number(attempt))) throw Error('invalid source attempt');
  const run = `/repos/${repo}/actions/runs/${id}/attempts/${attempt}`;
  return { run, jobs: `${run}/jobs?per_page=100` };
}
export function deploymentObservation(run, jobs, repo, expected) {
  if (run.id !== Number(expected.id) || run.run_attempt !== Number(expected.attempt)
      || !/^[a-f0-9]{40}$/.test(expected.sha || '') || run.head_sha !== expected.sha
      || run.conclusion !== expected.conclusion) throw Error('source event identity mismatch');
  if (run.status !== 'completed' || !terminalConclusions.includes(run.conclusion)) throw Error('source attempt is not terminal');
  const lane = productionLane(run, repo);
  if (jobs.some(job => job.run_id !== run.id || job.run_attempt !== run.run_attempt)) throw Error('job attempt mismatch');
  const job = jobs.find(entry => entry.name === lane.job);
  const base = { sourceSha: run.head_sha, sourceConclusion: run.conclusion, deploymentJobId: job?.id ?? null };
  if (!job || job.conclusion === 'skipped') return { ...base, shouldCheck: false, outcome: 'deploy_job_not_run' };
  if (job.status !== 'completed' || !terminalConclusions.includes(job.conclusion)) throw Error('deployment job is not terminal');
  const applied = (job.steps || []).filter(step => lane.apply.includes(step.name)
    && step.status === 'completed' && terminalConclusions.includes(step.conclusion)
    && Number.isFinite(Date.parse(step.started_at)));
  if (!applied.length) return { ...base, shouldCheck: false, outcome: run.conclusion === 'success' ? 'no_apply_attempt' : 'pre_apply_failure' };
  // This immutable attempt's deploy-job completion includes failure/rollback cleanup.
  // It is a lower bound: queue/setup time may make the actual check later.
  delayUntil(job.completed_at);
  const completedAt = new Date(job.completed_at).toISOString();
  return { ...base, shouldCheck: true,
    outcome: run.conclusion === 'success' ? 'succeeded' : 'unsuccessful_after_apply',
    deploymentJobConclusion: job.conclusion, completedAt,
    dueAt: new Date(Date.parse(completedAt) + 300000).toISOString(),
    attemptedApplySteps: applied.map(step => ({ name: step.name, conclusion: step.conclusion, startedAt: step.started_at })),
  };
}

export function isFeedApiUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host === 'firestore.googleapis.com'
      || host.endsWith('.cloudfunctions.net');
  } catch { return false; }
}

export function isAppCheckUrl(value) {
  try { return ['firebaseappcheck.googleapis.com', 'content-firebaseappcheck.googleapis.com'].includes(new URL(value).hostname); }
  catch { return false; }
}

export function isCompletedListenerCancellation(value, failure) {
  try {
    const url = new URL(value);
    return failure === 'net::ERR_ABORTED' && url.hostname === 'firestore.googleapis.com'
      && url.pathname === '/google.firestore.v1.Firestore/Listen/channel';
  } catch { return false; }
}

export function assertDeploymentCheckpoint(source, now = Date.now()) {
  const completed = Date.parse(source?.completedAt);
  const due = Date.parse(source?.dueAt);
  if (source?.shouldCheck !== true || !['miranae/orider-web', 'miranae/orider-g1-web'].includes(source.sourceRepository)
      || !/^[1-9]\d*$/.test(String(source.sourceRun)) || !Number.isSafeInteger(source.sourceAttempt) || source.sourceAttempt < 1
      || !/^[a-f0-9]{40}$/.test(source.sourceSha || '') || !terminalConclusions.includes(source.sourceConclusion)
      || !Number.isFinite(completed) || !Number.isFinite(due) || due !== completed + 300000 || now < due) {
    throw Error('deployment checkpoint is invalid or not due');
  }
  return source;
}
