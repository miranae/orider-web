#!/usr/bin/env node
// Apply only the production squash delta through a normal dev-target PR.
// A pending backport deliberately stops release completion; never push dev.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function command(cwd, bin, args, input, allowFailure = false) {
  const r = spawnSync(bin, args, { cwd, input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0 && !allowFailure) throw new Error(`${bin} ${args[0]} failed: ${r.stderr?.trim() || r.error?.message || r.status}`);
  return r;
}

export function prepareBackport(repo, sourceCommit) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error('Exact production squash SHA required');
  const git = (...args) => command(repo, 'git', args).stdout.trim();
  if (git('rev-list', '--parents', '-n', '1', sourceCommit).split(' ').length !== 2) throw new Error('Production commit must have exactly one parent');
  if (command(repo, 'git', ['merge-base', '--is-ancestor', sourceCommit, 'origin/main'], undefined, true).status !== 0) throw new Error('Source commit is not in origin/main');
  const patch = command(repo, 'git', ['diff', '--binary', `${sourceCommit}^`, sourceCommit]).stdout;
  if (!patch) return { state: 'already-present' };
  const parent = mkdtempSync(join(tmpdir(), 'orider-main-backport-'));
  const work = join(parent, 'work');
  try {
    git('worktree', 'add', '--detach', work, 'origin/dev');
    if (command(work, 'git', ['apply', '--reverse', '--check', '-'], patch, true).status === 0) return { state: 'already-present' };
    // No three-way fallback: concurrent/conflicting edits must be reviewed.
    command(work, 'git', ['apply', '--index', '--check', '-'], patch);
    command(work, 'git', ['apply', '--index', '-'], patch);
    command(work, 'git', ['commit', '-s', '-m', `fix: backport production ${sourceCommit.slice(0, 12)} to dev`, '-m', `Production-Commit: ${sourceCommit}`]);
    return { state: 'prepared', parent, work, commit: command(work, 'git', ['rev-parse', 'HEAD']).stdout.trim(), devBase: git('rev-parse', 'origin/dev') };
  } catch (error) {
    throw new Error(`Backport stopped without changing dev: ${error.message}`);
  } finally {
    // A prepared worktree remains until its caller pushes the topic branch.
    if (command(work, 'git', ['diff', '--quiet', 'origin/dev', 'HEAD'], undefined, true).status === 0 || command(work, 'git', ['diff', '--cached', '--quiet'], undefined, true).status !== 0) {
      const removed = command(repo, 'git', ['worktree', 'remove', work], undefined, true);
      if (removed.status === 0) rmSync(parent, { recursive: true, force: true });
    }
  }
}

export function cleanup(repo, prepared) {
  if (!prepared.work) return;
  if (existsSync(repo)) command(repo, 'git', ['worktree', 'remove', prepared.work]);
  rmSync(prepared.parent, { recursive: true, force: true });
}

export function validateExistingBackport(repo, sourceCommit, topicCommit) {
  const git = (...args) => command(repo, 'git', args).stdout;
  if (git('rev-list', '--parents', '-n', '1', topicCommit).trim().split(' ').length !== 2) throw new Error('Existing topic is not a single-parent backport');
  if (!git('show', '-s', '--format=%B', topicCommit).split('\n').includes(`Production-Commit: ${sourceCommit}`)) throw new Error('Existing topic belongs to a different source');
  // Preserve exact changed text, including meaningful whitespace; ignore only
  // base-object hashes and hunk positions affected by unrelated dev advances.
  const normalized = patch => patch.split('\n').filter(line => !line.startsWith('index '))
    .map(line => line.replace(/^@@[^@]*@@/, '@@')).join('\n');
  if (normalized(git('diff', '--binary', `${sourceCommit}^`, sourceCommit)) !== normalized(git('diff', '--binary', `${topicCommit}^`, topicCommit))) throw new Error('Existing topic delta differs from the exact production change');
}

function main() {
  const sourceCommit = process.argv[2];
  const repo = command(process.cwd(), 'git', ['rev-parse', '--show-toplevel']).stdout.trim();
  command(repo, 'git', ['fetch', 'origin', 'main', 'dev', '--quiet']);
  const prepared = prepareBackport(repo, sourceCommit);
  if (prepared.state === 'already-present') { console.log('Production delta is already present in current dev; no sync PR needed.'); return; }
  try {
    const branch = `sync/main-${sourceCommit.slice(0, 12)}`;
    const existing = JSON.parse(command(repo, 'gh', ['pr', 'list', '--base', 'dev', '--head', branch, '--state', 'all', '--json', 'number,url,state']).stdout);
    if (existing.some(pr => pr.state !== 'OPEN')) throw new Error('Previous backport is closed/merged but current dev does not contain the delta; explicit reconciliation required');
    if (!existing.length) {
      const remote = command(repo, 'git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]).stdout.trim();
      if (remote) {
        const remoteSha = remote.split(/\s+/)[0];
        command(repo, 'git', ['fetch', 'origin', `refs/heads/${branch}`, '--quiet']);
        validateExistingBackport(repo, sourceCommit, remoteSha);
      } else {
        command(prepared.work, 'git', ['push', 'origin', `HEAD:refs/heads/${branch}`]);
      }
      const body = `Backport only production squash ${sourceCommit} onto current dev (${prepared.devBase}).\n\nRetains unrelated dev changes. Merge with scripts/merge-pr.sh after review and required gates; no direct dev push, force push or policy exception.\n\nAfter merging, rerun: node scripts/sync-main-to-dev.mjs ${sourceCommit}`;
      const url = command(repo, 'gh', ['pr', 'create', '--draft', '--base', 'dev', '--head', branch, '--title', `fix: backport production ${sourceCommit.slice(0, 12)}`, '--body', body]).stdout.trim();
      console.log(`Backport draft PR created: ${url}`);
    } else {
      console.log(`Existing backport ${existing[0].state}: ${existing[0].url}`);
    }
    console.error(`Release synchronization PENDING: review/merge the dev PR through scripts/merge-pr.sh, then rerun node scripts/sync-main-to-dev.mjs ${sourceCommit}. Do not rerun the already merged production PR.`);
    process.exitCode = 3;
  } finally { cleanup(repo, prepared); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
