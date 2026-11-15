import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command, prepareBackport, cleanup, validateExistingBackport, assertPromotionAncestry, prepareSnapshotAncestry } from './sync-main-to-dev.mjs';

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


test('ancestry synchronization preserves both protected parents without changing product files', t => {
  const {repo,git,source}=fixture(t);
  git('cherry-pick',source); const base=git('rev-parse','HEAD'); git('update-ref','refs/remotes/origin/dev',base);
  git('merge','--no-ff','--no-commit',source); // A cherry-pick is not an ancestor link.
  git('commit','--signoff','-m','sync ancestry','-m',`Production-Commit: ${source}`);
  const head=git('rev-parse','HEAD'),branch=`sync/promotion-${source.slice(0,12)}`;
  assert.equal(assertPromotionAncestry(repo,base,head,source,branch).method,'merge');
  assert.throws(()=>assertPromotionAncestry(repo,base,head,source,'other'),/branch/);
  assert.throws(()=>assertPromotionAncestry(repo,base,base,source,branch),/parents/);
  writeFileSync(join(repo,'other.txt'),'changed source\n'); git('add','.');
  git('commit','--amend','--no-edit');
  assert.throws(()=>assertPromotionAncestry(repo,base,git('rev-parse','HEAD'),source,branch),/preserve the dev tree/);
  git('update-ref','refs/remotes/origin/main',base);
  assert.throws(()=>assertPromotionAncestry(repo,base,head,source,branch),/advanced/);
});

function snapshotFixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'snapshot-ancestry-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => command(repo, 'git', a).stdout.trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'QA'); git('config', 'user.email', 'qa@example.invalid');
  writeFileSync(join(repo, 'app.txt'), 'v1\n'); git('add', '.'); git('commit', '-m', 'base');
  const oldMain = git('rev-parse', 'HEAD');
  git('checkout', '-b', 'dev'); writeFileSync(join(repo, 'app.txt'), 'v2\n'); git('commit', '-am', 'feature');
  const snapshot = git('rev-parse', 'HEAD');
  // Squash promotion: main gets the snapshot tree on its own single-parent history.
  const production = command(repo, 'git', ['commit-tree', `${snapshot}^{tree}`, '-p', oldMain], 'promote snapshot\n').stdout.trim();
  git('update-ref', 'refs/remotes/origin/main', production);
  writeFileSync(join(repo, 'later.txt'), 'merged after the snapshot\n'); git('add', '.'); git('commit', '-m', 'later dev work');
  git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
  return { repo, git, snapshot, production, dev: git('rev-parse', 'HEAD') };
}

test('snapshot promotion ancestry keeps later dev work and links exact main', t => {
  const { repo, git, snapshot, production, dev } = snapshotFixture(t);
  const p = prepareSnapshotAncestry(repo, production, snapshot);
  assert.equal(p.state, 'prepared');
  assert.equal(p.branch, `sync/promotion-${production.slice(0, 12)}`);
  assert.deepEqual(git('rev-list', '--parents', '-n', '1', p.head).split(' ').slice(1), [dev, production]);
  assert.equal(git('rev-parse', `${p.head}^{tree}`), git('rev-parse', `${dev}^{tree}`));
  assert.match(git('show', '-s', '--format=%B', p.head), /Signed-off-by: QA <qa@example.invalid>/);
  assert.equal(git('rev-parse', 'origin/dev'), dev);
});

test('snapshot ancestry refuses a main tree that is not the promoted snapshot', t => {
  const { repo, git, production, dev } = snapshotFixture(t);
  assert.throws(() => prepareSnapshotAncestry(repo, production, dev), /tree differs/);
  git('update-ref', 'refs/remotes/origin/main', dev);
  assert.throws(() => prepareSnapshotAncestry(repo, production, dev), /main advanced/);
});

test('snapshot ancestry refuses a snapshot that dev no longer contains', t => {
  const { repo, git, snapshot, production } = snapshotFixture(t);
  git('checkout', '-b', 'rewritten', `${snapshot}^`); writeFileSync(join(repo, 'other.txt'), 'x\n'); git('add', '.'); git('commit', '-m', 'other');
  git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
  assert.throws(() => prepareSnapshotAncestry(repo, production, snapshot), /not in current dev/);
});

test('snapshot ancestry is idempotent once main is linked', t => {
  const { repo, git, snapshot, production } = snapshotFixture(t);
  const p = prepareSnapshotAncestry(repo, production, snapshot);
  git('update-ref', 'refs/remotes/origin/dev', p.head);
  assert.equal(prepareSnapshotAncestry(repo, production, snapshot).state, 'already-linked');
});

test('snapshot ancestry rebuilds the identical commit on retry', t => {
  const { repo, snapshot, production } = snapshotFixture(t);
  const first = prepareSnapshotAncestry(repo, production, snapshot);
  const second = prepareSnapshotAncestry(repo, production, snapshot);
  assert.equal(second.head, first.head);
});
