import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkDco } from './check-dco.mjs';

const identity = 'Contributor <contributor@example.test>';
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'orider-dco-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Contributor');
  git('config', 'user.email', 'contributor@example.test');
  const commit = (message, author = identity) => {
    git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '--author', author, '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const base = commit(`base\n\nSigned-off-by: ${identity}`);
  return { cwd, git, commit, base };
}
const statement = sha => `I, ${identity}, hereby add my Signed-off-by to this commit: ${sha}`;

test('keeps normal signed commits passing and unsigned commits failing', t => {
  const f = fixture(t);
  const signed = f.commit(`feature\n\nSigned-off-by: ${identity}`);
  assert.deepEqual(checkDco(f.base, signed, f.cwd).missing, []);
  const missing = f.commit('unsigned');
  assert.deepEqual(checkDco(f.base, missing, f.cwd).missing, [missing]);
});

test('accepts exact same-author signed individual remediation without rewriting history', t => {
  const f = fixture(t);
  const missing = f.commit('unsigned');
  const head = f.commit(`DCO remediation\n\n${statement(missing)}\n\nSigned-off-by: ${identity}`);
  assert.deepEqual(checkDco(f.base, head, f.cwd).remediated, [{ sha: missing, attestation: head }]);
  assert.deepEqual(checkDco(f.base, head, f.cwd).missing, []);
});

for (const scenario of ['wrong-author', 'wrong-signoff', 'unsigned-attestation', 'short-sha', 'wrong-sha', 'blanket', 'third-party']) {
  test(`rejects ${scenario} remediation`, t => {
    const f = fixture(t);
    const missing = f.commit('unsigned');
    const text = scenario === 'short-sha' ? statement(missing.slice(0, 7))
      : scenario === 'wrong-sha' ? statement('0'.repeat(40))
      : scenario === 'blanket' ? `I, ${identity}, sign off all prior commits`
      : scenario === 'third-party' ? `On behalf of ${identity}, I, Other <other@example.test>, hereby add my Signed-off-by to this commit: ${missing}` : statement(missing);
    const trailer = scenario === 'unsigned-attestation' ? '' : `\n\nSigned-off-by: ${scenario === 'wrong-signoff' ? 'Other <other@example.test>' : identity}`;
    const head = f.commit(`DCO remediation\n\n${text}${trailer}`, scenario === 'wrong-author' ? 'Other <other@example.test>' : identity);
    assert.ok(checkDco(f.base, head, f.cwd).missing.includes(missing));
  });
}

test('rejects unreachable or sibling attestation even when its SHA/author match', t => {
  const f = fixture(t);
  const missing = f.commit('unsigned');
  f.git('checkout', '-b', 'sibling', f.base);
  const sibling = f.commit(`DCO remediation\n\n${statement(missing)}\n\nSigned-off-by: ${identity}`);
  assert.ok(checkDco(f.base, missing, f.cwd).missing.includes(missing));
  f.git('checkout', '--detach', missing);
  f.git('-c', 'commit.gpgsign=false', 'merge', '--no-ff', sibling, '-m', 'merge sibling');
  assert.ok(checkDco(f.base, 'HEAD', f.cwd).missing.includes(missing));
});

test('one exact attestation cannot exempt another unsigned commit', t => {
  const f = fixture(t);
  const one = f.commit('unsigned one');
  const two = f.commit('unsigned two');
  const head = f.commit(`DCO remediation\n\n${statement(one)}\n\nSigned-off-by: ${identity}`);
  assert.deepEqual(checkDco(f.base, head, f.cwd).missing, [two]);
});
