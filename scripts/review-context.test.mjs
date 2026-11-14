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
  assert.deepEqual(sourceImports('index.ts', 'export { a } from "./a"; export { b } from "./b";', ['a']).map(e => e.specifier), ['./a', './b']);
});

test('tracked source symlinks fail closed instead of reading external source', t => {
  const f = fixture(t);
  symlinkSync('/etc/passwd', join(f.repo, 'src/escape.ts'));
  f.put('src/page.ts', 'import "./escape";');
  const head = f.commit();
  assert.throws(() => buildReviewContext({ repo: f.repo, head, from: f.base }), /symlink/);
});

test('comment-only service edits do not pull unrelated callers, and changed exports select their actual callers', t => {
  const f = fixture(t);
  f.put('src/services/api.ts', 'export function changed() { return 1; }\nexport function stable() { return 1; }');
  f.put('src/relevant.ts', 'import { changed } from "./services/api"; console.log(changed());');
  f.put('src/unrelated.ts', 'import { stable } from "./services/api"; console.log(stable());');
  const base = f.commit();
  f.put('src/services/api.ts', 'export function changed() { return 2; }\nexport function stable() { return 1; }');
  f.put('src/services/data.ts', '// documented ordinary-web fallback\nimport { auth } from "./firebase"; export const load = () => auth.currentUser;');
  const head = f.commit();
  const result = buildReviewContext({ repo: f.repo, head, from: base });
  assert.ok(result.manifest.files.some(f => f.path === 'src/relevant.ts'));
  assert.ok(!result.manifest.files.some(f => f.path === 'src/unrelated.ts'));
});

test('new files are explicitly located in the complete diff rather than duplicated in context', t => {
  const f = fixture(t);
  f.put('src/new.ts', 'import { load } from "./services/data"; export const next = load();');
  const head = f.commit();
  const result = buildReviewContext({ repo: f.repo, head, from: f.base });
  assert.equal(result.manifest.files.find(f => f.path === 'src/new.ts').contentLocation, 'diff');
  assert.equal(result.manifest.files.find(f => f.path === 'src/services/data.ts').contentLocation, 'context');
  assert.match(result.text, /auth.currentUser/);
  assert.doesNotMatch(result.text, /--- source: src\/new.ts ---/);
});

test('activating an unchanged local helper includes its existing import dependencies', t => {
  const f = fixture(t);
  f.put('src/page.ts', 'import { load } from "./services/data"; function helper() { return load(); } export const page = () => null;');
  const base = f.commit();
  f.put('src/page.ts', 'import { load } from "./services/data"; function helper() { return load(); } export const page = () => helper();');
  const result = buildReviewContext({ repo: f.repo, head: f.commit(), from: base });
  assert.ok(result.manifest.files.some(f => f.path === 'src/services/data.ts'));
  assert.ok(result.manifest.files.some(f => f.path === 'src/services/firebase.ts'));
});

test('test-only changes expand the real subject through its surface and page, with UI boundaries recorded', t => {
  const f = fixture(t);
  f.put('src/entry.ts', 'export { page } from "./surface";');
  f.put('src/surface.ts', 'export { page } from "./page";');
  f.put('src/page.ts', 'import { load } from "./services/data"; import { child } from "./child"; export const page = () => [load(), child];');
  f.put('src/child.tsx', 'export const child = 1;');
  const base = f.commit();
  f.put('src/entry.test.ts', 'import { page } from "./entry"; page();');
  const result = buildReviewContext({ repo: f.repo, head: f.commit(), from: base });
  for (const path of ['src/surface.ts', 'src/page.ts', 'src/services/data.ts']) assert.ok(result.manifest.files.some(f => f.path === path), path);
  assert.ok(result.manifest.unexpandedUiBoundaries.includes('src/child.tsx'));
});

test('bounded batches cover every source and keep each caller/callee pair together', t => {
  const f = fixture(t);
  for (let i = 0; i < 20; i++) f.put(`src/services/dep${i}.ts`, `export const value${i} = ${JSON.stringify('x'.repeat(700))};`);
  const base = f.commit();
  f.put('src/page.ts', Array.from({ length: 20 }, (_, i) => `import { value${i} } from "./services/dep${i}";`).join('\n') + '\nexport const page = [value0];');
  const result = buildReviewContext({ repo: f.repo, head: f.commit(), from: base, maxBytes: 5500, batches: true });
  assert.ok(result.contexts.length > 1);
  const supplied = result.contexts.map(text => {
    assert.ok(Buffer.byteLength(text) <= 5500);
    return new Set(JSON.parse(text.split('\n')[1]).includedFiles);
  });
  for (let i = 0; i < 20; i++) assert.ok(supplied.some(files => files.has('src/page.ts') && files.has(`src/services/dep${i}.ts`)));
  for (const record of result.manifest.files.filter(record => record.contentLocation === 'context')) assert.ok(supplied.some(files => files.has(record.path)), record.path);
  assert.throws(() => buildReviewContext({ repo: f.repo, head: 'HEAD', from: base, maxBytes: 1000, batches: true }), /budget/);
});


test('inline type specifiers conservatively retain runtime module evaluation', () => {
  assert.deepEqual(sourceImports('src/a.ts', 'import { type A } from "./runtime"; export { type B } from "./side-effect";').map(edge => edge.specifier), ['./runtime', './side-effect']);
});

test('context-only normal web dependencies are distinguished from the actual embedded lint scope', t => {
  const f = fixture(t);
  f.put('eslint-embed-scope.json', JSON.stringify(['src/services/data.ts']));
  const base = f.commit();
  f.put('src/page.ts', 'import { load } from "./services/data"; export const page = load();');
  const result = buildReviewContext({ repo: f.repo, head: f.commit(), from: base });
  assert.equal(result.manifest.files.find(f => f.path === 'src/services/data.ts').embeddedReachable, true);
  assert.equal(result.manifest.files.find(f => f.path === 'src/caller.ts').embeddedReachable, false);
  assert.deepEqual(result.manifest.files.find(f => f.path === 'src/page.ts').runtimeDependencies, ['src/services/data.ts']);
  assert.ok(result.manifest.embeddedScopeSha256);
});

test('caller auth helpers and consumers behind re-export barrels are expanded', t => {
  const f = fixture(t);
  f.put('src/services/api.ts', 'export function load() { return 1; }');
  f.put('src/barrel.ts', 'export { load as publicLoad } from "./services/api";');
  f.put('src/consumer.tsx', 'import { publicLoad } from "./barrel"; import { session } from "./account/session"; export const useData = () => publicLoad(session());');
  f.put('src/account/session.ts', 'import { owner } from "./owner"; export const session = () => owner;');
  f.put('src/account/owner.ts', 'export const owner = "named-app";');
  const base = f.commit();
  f.put('src/services/api.ts', 'export function load(services) { return services; }');
  const result = buildReviewContext({ repo: f.repo, head: f.commit(), from: base });
  for (const path of ['src/barrel.ts', 'src/consumer.tsx', 'src/account/session.ts', 'src/account/owner.ts']) assert.ok(result.manifest.files.some(f => f.path === path), path);
});


test('constant-template dynamic imports remain execution dependencies', () => {
  assert.deepEqual(sourceImports('src/a.ts', 'const load = () => import(`./service`);').map(edge => edge.specifier), ['./service']);
});
