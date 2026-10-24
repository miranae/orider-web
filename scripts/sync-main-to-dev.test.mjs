import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command, prepareBackport, cleanup, validateExistingBackport } from './sync-main-to-dev.mjs';

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'backport-test-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => command(repo, 'git', a).stdout.trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'QA'); git('config', 'user.email', 'qa@example.invalid');
  writeFileSync(join(repo, 'security.txt'), 'before\n'); git('add', '.'); git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, 'security.txt'), 'after\n'); git('commit', '-am', 'production hotfix');
  const source = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/main', source);
  git('checkout', '-b', 'dev', base); writeFileSync(join(repo, 'other.txt'), 'concurrent dev\n'); git('add', '.'); git('commit', '-m', 'other work');
  git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
  return { repo, git, source };
}

test('backport is one-parent, signed off, preserves unrelated current dev changes', t => {
  const { repo, git, source } = fixture(t); const before = git('rev-parse', 'origin/dev');
  const p = prepareBackport(repo, source); t.after(() => cleanup(repo, p));
  assert.equal(p.state, 'prepared');
  assert.equal(git('rev-parse', `${p.commit}^`), before);
  assert.equal(git('rev-list', '--parents', '-n', '1', p.commit).split(' ').length, 2);
  assert.match(git('show', '-s', '--format=%B', p.commit), /Signed-off-by: QA/);
  assert.equal(readFileSync(join(p.work, 'other.txt'), 'utf8'), 'concurrent dev\n');
  assert.equal(readFileSync(join(p.work, 'security.txt'), 'utf8'), 'after\n');
  assert.equal(git('rev-parse', 'origin/dev'), before);
});

test('merged or previously applied production delta is idempotent', t => {
  const { repo, git, source } = fixture(t);
  git('cherry-pick', source); git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
  assert.equal(prepareBackport(repo, source).state, 'already-present');
});

test('new dev advances are included without changing their commits', t => {
  const { repo, git, source } = fixture(t);
  writeFileSync(join(repo, 'later.txt'), 'later\n'); git('add', '.'); git('commit', '-m', 'later work');
  git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
  const p=prepareBackport(repo, source); t.after(() => cleanup(repo,p));
  assert.equal(readFileSync(join(p.work,'later.txt'),'utf8'),'later\n');
});

test('conflicts fail closed and preserve current dev', t => {
  const { repo, git, source } = fixture(t);
  writeFileSync(join(repo,'security.txt'),'conflicting dev\n'); git('commit','-am','conflict'); git('update-ref','refs/remotes/origin/dev','HEAD');
  const before=git('rev-parse','HEAD');
  assert.throws(() => prepareBackport(repo,source),/stopped without changing dev/);
  assert.equal(git('rev-parse','HEAD'),before);
  assert.equal(git('rev-parse','origin/dev'),before);
});

test('unknown/nonproduction source is rejected before applying anything', t => {
  const { repo, git }=fixture(t);
  assert.throws(() => prepareBackport(repo,'main'),/Exact production/);
  assert.throws(() => prepareBackport(repo,git('rev-parse','HEAD')),/not in origin.main/);
});

test('resume after topic push reuses only the exact source delta and provenance', t => {
  const { repo, source }=fixture(t);
  const p=prepareBackport(repo,source);t.after(()=>cleanup(repo,p));
  assert.doesNotThrow(()=>validateExistingBackport(repo,source,p.commit));
  assert.throws(()=>validateExistingBackport(repo,source,source),/different source/);
});

test('resume rejects changed topic content even when its source trailer is retained', t => {
  const { repo, source }=fixture(t);
  const p=prepareBackport(repo,source);t.after(()=>cleanup(repo,p));
  writeFileSync(join(p.work,'security.txt'),'altered\n');
  command(p.work,'git',['commit','-am','changed topic','-m',`Production-Commit: ${source}`]);
  const changed=command(p.work,'git',['rev-parse','HEAD']).stdout.trim();
  assert.throws(()=>validateExistingBackport(repo,source,changed),/delta differs/);
});
