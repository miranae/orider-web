import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildReviewContext, resolveSource, sourceImports } from './review-context.mjs';

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'review-context-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  const put = (file, text) => { mkdirSync(dirname(join(repo, file)), { recursive: true }); writeFileSync(join(repo, file), text); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  git('init', '-q');
  put('src/page.ts', 'export const page = 1;');
  put('src/services/data.ts', 'import { auth } from "./firebase"; export const load = () => auth.currentUser;');
  put('src/services/firebase.ts', 'export const auth = undefined;');
  put('src/embedded/embeddedFirebase.ts', 'export const namedApp = true;');
  put('src/caller.ts', 'import { page } from "./page"; console.log(page);');
  return { repo, put, git, commit, base: commit() };
}

test('new page path includes unchanged transitive service, caller and absent-app bootstrap from tracked head only', t => {
  const f = fixture(t);
  f.put('src/page.ts', 'import { load } from "./services/data"; export const page = load();');
  const head = f.commit();
  f.put('src/services/data.ts', 'UNCOMMITTED SECRET MUST NOT BE READ');
  f.put('.env', 'DO NOT READ');
  const result = buildReviewContext({ repo: f.repo, head, from: f.base });
  for (const path of ['src/services/data.ts', 'src/services/firebase.ts', 'src/caller.ts', 'src/embedded/embeddedFirebase.ts']) assert.ok(result.manifest.files.some(f => f.path === path), path);
  assert.match(result.text, /auth.currentUser/);
  assert.doesNotMatch(result.text, /UNCOMMITTED SECRET|DO NOT READ/);
  assert.throws(() => buildReviewContext({ repo: f.repo, head, from: f.base, maxBytes: 10 }), /budget/);
});

test('aliases, explicit JS extensions, runtime barrels and literal dynamic imports resolve; type-only does not', () => {
  const files = new Set(['src/services/firebase.ts', 'shared/types.ts']);
  assert.equal(resolveSource('src/services/a.ts', './firebase.js', files), 'src/services/firebase.ts');
  assert.equal(resolveSource('src/a.ts', '@/services/firebase', files), 'src/services/firebase.ts');
  assert.equal(resolveSource('src/a.ts', '@shared/types', files), 'shared/types.ts');
  assert.deepEqual(sourceImports('src/a.ts', 'import type { A } from "./types"; export type { B } from "./types"; export { load } from "./service"; const x = import("./lazy");').map(e => e.specifier), ['./service', './lazy']);
  assert.deepEqual(sourceImports('index.ts', 'export { a } from "./a"; export { b } from "./b";', ['a']).map(e => e.specifier), ['./a']);
});

test('tracked source symlinks fail closed instead of reading external source', t => {
  const f = fixture(t);
  symlinkSync('/etc/passwd', join(f.repo, 'src/escape.ts'));
  f.put('src/page.ts', 'import "./escape";');
  const head = f.commit();
  assert.throws(() => buildReviewContext({ repo: f.repo, head, from: f.base }), /symlink/);
});
