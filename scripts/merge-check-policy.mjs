// CodeQL은 계속 스캔하지만 로컬 머지 게이트의 필수 검사는 아니다.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const passing = new Set(['success', 'neutral', 'skipped']);
const pending = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

export function isCodeQL(check, workflows, head, repository) {
  if (check.head_sha !== head) return false;
  if (check.name === 'CodeQL' && check.app?.id === 57789 && check.app?.slug === 'github-advanced-security') return true;
  if (check.app?.id !== 15368 || check.app?.slug !== 'github-actions') return false;
  const escaped = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = check.details_url?.match(new RegExp(`^https://github\\.com/${escaped}/actions/runs/(\\d+)(?:/job/\\d+)?$`));
  const run = match && workflows[match[1]];
  return Boolean(run && run.id === Number(match[1]) && run.head_sha === head &&
    run.check_suite_id === check.check_suite?.id &&
    (run.path === 'dynamic/github-code-scanning/codeql' ||
      (run.name === 'CodeQL' && /^\.github\/workflows\/codeql\.ya?ml$/.test(run.path))));
}

// GitHub's filter=latest is scoped to a check suite. Edited PR events create
// another suite for the same SHA, so retain the latest authenticated workflow run.
function latestWorkflowChecks(checks, workflows, head, repository) {
  const selected = new Map();
  const ungrouped = [];
  for (const check of checks) {
    const url = check.details_url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)(?:\/job\/\d+)?$/);
    const run = url && workflows[url[2]];
    if (check.head_sha !== head || check.app?.id !== 15368 || check.app?.slug !== 'github-actions'
      || !url || url[1] !== repository || !run || run.id !== Number(url[2])
      || run.head_sha !== head || run.check_suite_id !== check.check_suite?.id
      || !run.path || !check.name) {
      ungrouped.push(check);
      continue;
    }
    const key = JSON.stringify([check.app.id, run.path, check.name]);
    const previous = selected.get(key);
    if (!previous || run.id > previous.run.id) selected.set(key, { run, checks: [check] });
    else if (run.id === previous.run.id) previous.checks.push(check);
  }
  return [...ungrouped, ...[...selected.values()].flatMap(item => item.checks)];
}

export function evaluateChecks({ checks, statuses, workflows, head, repository }) {
  if (!head || !repository || !Array.isArray(checks) || !Array.isArray(statuses) || !workflows) {
    return { state: 'blocked', reasons: ['검사 메타데이터 누락'], ignored: [] };
  }
  const ignored = [], failures = [], waiting = [];
  for (const check of latestWorkflowChecks(checks, workflows, head, repository)) {
    if (check.head_sha !== head || !check.name || !check.app?.id || !check.app?.slug) {
      failures.push('검사 head 또는 app 메타데이터 불명');
    } else if (isCodeQL(check, workflows, head, repository)) {
      ignored.push(check.name);
    } else if (check.status === 'completed' && passing.has(check.conclusion)) {
      // 일반 검사는 성공·중립·명시적 생략만 허용한다.
    } else if (pending.has(check.status)) {
      waiting.push(check.name);
    } else {
      failures.push(`${check.name}: ${check.conclusion ?? check.status ?? 'unknown'}`);
    }
  }
  // REST statuses는 최신순이다. 같은 context의 예전 실패로 최신 성공을 막지 않는다.
  const contexts = new Set();
  for (const status of statuses) {
    if (!status.context) { failures.push('status context 누락'); continue; }
    if (contexts.has(status.context)) continue;
    contexts.add(status.context);
    if (status.state === 'pending') waiting.push(status.context);
    else if (status.state !== 'success') failures.push(`${status.context}: ${status.state ?? 'unknown'}`);
  }
  return { state: failures.length ? 'blocked' : waiting.length ? 'pending' : 'pass',
    reasons: failures.length ? failures : waiting, ignored };
}

export function validateMergeState(meta, head, ignoredCount = 0) {
  if (meta.headRefOid !== head) return 'PR head 변경';
  if (meta.state !== 'OPEN' || meta.isDraft !== false) return 'PR이 OPEN·ready 상태가 아님';
  if (meta.mergeable !== 'MERGEABLE') return `mergeable=${meta.mergeable ?? 'unknown'}`;
  if (!['CLEAN', 'UNSTABLE'].includes(meta.mergeStateStatus)) return `mergeStateStatus=${meta.mergeStateStatus ?? 'unknown'}`;
  if (meta.mergeStateStatus === 'UNSTABLE' && ignoredCount === 0) return 'CodeQL로 설명되지 않는 UNSTABLE';
  return null;
}

function gh(...args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
}

export async function runGate(pr, head, wait, { query = gh, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const repository = query('repo', 'view', '--json', 'nameWithOwner').nameWithOwner;
  for (;;) {
    const checks = query('api', '--paginate', '--slurp', `repos/${repository}/commits/${head}/check-runs?filter=latest&per_page=100`).flatMap(page => page.check_runs);
    const statuses = query('api', '--paginate', '--slurp', `repos/${repository}/commits/${head}/statuses?per_page=100`).flat();
    const workflows = {};
    for (const check of checks) {
      if (check.app?.id !== 15368 || check.app?.slug !== 'github-actions') continue;
      const url = check.details_url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)(?:\/job\/\d+)?$/);
      if (!url || url[1] !== repository || workflows[url[2]]) continue;
      workflows[url[2]] = query('api', `repos/${repository}/actions/runs/${url[2]}`);
    }
    const result = evaluateChecks({ checks, statuses, workflows, head, repository });
    const meta = query('pr', 'view', pr, '--json', 'state,isDraft,headRefOid,mergeable,mergeStateStatus');
    if (meta.headRefOid !== head || meta.state !== 'OPEN' || meta.isDraft !== false) throw new Error('PR 상태 또는 검증한 head 변경');
    console.log(`GitHub 검사: ${result.state}; CodeQL 비차단 ${result.ignored.length}개${result.reasons.length ? `; ${result.reasons.join(', ')}` : ''}`);
    if (result.state === 'blocked' || (result.state === 'pending' && !wait)) throw new Error('CodeQL 이외 GitHub 검사 미통과');
    if (result.state === 'pending') {
      await pause(10000);
      continue;
    }
    const invalid = validateMergeState(meta, head, result.ignored.length);
    if (invalid) throw new Error(invalid);
    return;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [pr, head, mode] = process.argv.slice(2);
  if (!/^\d+$/.test(pr ?? '') || !/^[a-f0-9]{40}$/.test(head ?? '') || !['wait', 'no-wait'].includes(mode)) {
    console.error('Usage: node scripts/merge-check-policy.mjs PR HEAD wait|no-wait');
    process.exitCode = 1;
  } else {
    try { await runGate(pr, head, mode === 'wait'); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
