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
export function successfulDeploy(run, jobs, repo) {
  let name;
  if (repo === 'miranae/orider-web' && run.path === '.github/workflows/deploy.yml' && run.event === 'push' && /^v/.test(run.head_branch)) name = 'deploy';
  if (repo === 'miranae/orider-g1-web' && run.path === '.github/workflows/deploy.yml' && run.event === 'push' && /^v/.test(run.head_branch)) name = 'Build & Deploy to Firebase';
  if (repo === 'miranae/orider-g1-web' && run.path === '.github/workflows/hotfix-fast-deploy.yml' && run.event === 'workflow_dispatch') name = 'Execute bounded production plan';
  const job = jobs.find(j => j.name === name && j.conclusion === 'success' && j.status === 'completed');
  if (run.conclusion !== 'success' || !name || !job?.completed_at) throw Error('not a successful production deploy');
  delayUntil(job.completed_at);
  return job.completed_at;
}

export function isFeedApiUrl(value) {
  try {
    const host = new URL(value).hostname;
    return ['firestore.googleapis.com', 'firebaseappcheck.googleapis.com', 'content-firebaseappcheck.googleapis.com'].includes(host)
      || host.endsWith('.cloudfunctions.net');
  } catch { return false; }
}
