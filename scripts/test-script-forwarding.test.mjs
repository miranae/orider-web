import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const merge = readFileSync(new URL('./merge-pr.sh', import.meta.url), 'utf8');
const featureStart = merge.indexOf('if [[ "$GATE_TIER" == "feature" ]]; then');
const featureEnd = merge.indexOf('\nelse\n', featureStart);
assert.ok(featureStart >= 0 && featureEnd > featureStart);
const featureGate = merge.slice(featureStart, featureEnd) + '\nfi\n';
const contracts = [
  'scripts/production-hosting-evidence.test.mjs',
  'scripts/merge-gate-ci-reuse.test.mjs',
  'scripts/social-callable-contract.test.mjs',
  'scripts/write-runtime-config.test.mjs',
  'scripts/check-canonical-deploy-env.test.mjs',
  'scripts/check-deploy-config.test.mjs',
  'scripts/check-dco.test.mjs',
  'scripts/merge-pr-review-range.test.mjs',
  'scripts/script-tests-wired.test.mjs',
  'scripts/quality-alert-count.test.mjs',
  'scripts/check-canonical-contract.mjs',
  'scripts/test-script-forwarding.test.mjs',
];

function runGate({ feature = false, fail = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orider-test-forwarding-'));
  try {
    const bin = join(dir, 'node_modules', '.bin');
    mkdirSync(bin, { recursive: true });
    const eventsFile = join(dir, 'events.jsonl');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, private: true }));
    const stub = `#!${process.execPath}
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const name = require('node:path').basename(process.argv[1]);
const args = process.argv.slice(2);
// npm itself still runs normally; only the leaf tools are recorded/stubbed.
if (name === 'node' && !args.includes('--test') && !args.some(arg => arg === 'scripts/check-canonical-contract.mjs')) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 1);
}
fs.appendFileSync(process.env.EVENTS_FILE, JSON.stringify({ name, args, nodeOptions: process.env.NODE_OPTIONS ?? '' }) + '\\n');
const step = name === 'node' ? args.at(-1) : name;
process.exit(process.env.FAIL_STEP === step ? 23 : 0);
`;
    for (const name of ['node', 'vitest', 'npx']) {
      const path = join(bin, name);
      writeFileSync(path, stub);
      chmodSync(path, 0o755);
    }
    const body = feature ? `set -euo pipefail
GATE_TIER=feature
BASE=dev
log() { :; }
die() { exit 31; }
run_step() { shift 2; "$@"; }
${featureGate}` : 'set -euo pipefail\nnpm test';
    const result = spawnSync('bash', ['-c', body], {
      cwd: dir, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, EVENTS_FILE: eventsFile, FAIL_STEP: fail },
    });
    assert.equal(result.error, undefined, String(result.error));
    const events = readFileSync(eventsFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    return { ...result, events };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function assertContracts(events) {
  assert.deepEqual(events.filter(event => event.name === 'node').map(event => event.args.at(-1)), contracts);
  assert.ok(events.filter(event => event.name === 'node').every(event => !event.args.includes('--changed') && !event.args.includes('--passWithNoTests')));
}

test('default npm test still runs full Vitest followed by every contract check', () => {
  const result = runGate();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events[0].args, ['run']);
  assert.equal(result.events[0].nodeOptions, '--no-experimental-webstorage');
  assertContracts(result.events);
});

test('feature gate forwards changed flags only to Vitest, then runs every contract and typecheck', () => {
  const result = runGate({ feature: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events[0], { name: 'vitest', args: ['run', '--changed', 'origin/dev', '--passWithNoTests'], nodeOptions: '--no-experimental-webstorage' });
  assertContracts(result.events);
  assert.deepEqual(result.events.at(-1).args, ['tsc', '-b', '--pretty', 'false']);
});

test('Vitest failure stops feature merge before contracts or typecheck', () => {
  const result = runGate({ feature: true, fail: 'vitest' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.events.map(event => event.name), ['vitest']);
});

test('the first failing contract stops remaining checks and feature typecheck', () => {
  const result = runGate({ feature: true, fail: contracts[1] });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.events.map(event => event.name), ['vitest', 'node', 'node']);
  assert.deepEqual(result.events.slice(1).map(event => event.args.at(-1)), contracts.slice(0, 2));
});
