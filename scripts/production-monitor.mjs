import { chromium } from 'playwright';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { classify } from './production-monitor-lib.mjs';
const base = process.env.PROD_SMOKE_BASE_URL || 'https://orider.co.kr';
const out = resolve(process.env.MONITOR_RESULT_DIR || 'production-monitor-results');
const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, '-');
const dir = join(out, runId);
await mkdir(dir, { recursive: true });
const result = { schemaVersion: 1, startedAt, trigger: process.env.MONITOR_TRIGGER || 'manual', simulation: process.env.MONITOR_SIMULATE || null, runUrl: process.env.GITHUB_ACTIONS ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null, hostingVersion: process.env.MONITOR_HOSTING_VERSION || null, live: [], checks: [] };
if (process.env.MONITOR_RESOLVE_HOSTING === 'true') {
  try {
    const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const response = await fetch('https://firebasehosting.googleapis.com/v1beta1/sites/miranae-orider-g1/releases?pageSize=1', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw Error('Hosting metadata read failed');
    const release = (await response.json()).releases?.[0];
    result.hostingVersion = release?.version?.name || null;
    result.hostingRelease = { name: release?.name, releaseTime: release?.releaseTime, observedAt: new Date().toISOString() };
  } catch { result.hostingMetadataError = 'Existing read-only Hosting identity unavailable'; }
}
// No HAR, storage state, response bodies, query strings or rider data are persisted.
const safeUrl = value => { try { const u = new URL(value); return `${u.origin}${u.pathname.replace(/\/activity\/[^/]+/g, '/activity/[redacted]').replace(/\/apps\/[^/]+/g, '/apps/[redacted]')}`; } catch { return '[invalid-url]'; } };
const category = text => /chunk|dynamically imported|module script/i.test(text) ? 'chunk' : /firestore|firebase|permission|unavailable|fetch|network|activity/i.test(text) ? 'api' : 'other';
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.MONITOR_CHROMIUM_PATH ? { executablePath: process.env.MONITOR_CHROMIUM_PATH } : {}) });
  for (const locale of ['ko', 'en']) {
    const context = await browser.newContext({ viewport: { width: 393, height: 851 }, locale, serviceWorkers: 'block' });
    const page = await context.newPage();
    const check = { locale, at: new Date().toISOString(), httpStatus: null, rootVisible: false, cards: 0, cardContentVisible: false, emptyVisible: false, verifiedEmpty: false, pageErrors: [], apiErrors: [], chunkErrors: [], console: [], network: [], feedAlert: false };
    result.checks.push(check);
    const pending = [];
    page.on('pageerror', error => check.pageErrors.push({ category: category(error.message), digest: createHash('sha256').update(error.message).digest('hex') }));
    page.on('console', msg => { if (msg.type() === 'error') { const kind = category(msg.text()); check.console.push({ type: 'error', category: kind, source: safeUrl(msg.location().url), codes: msg.text().match(/(?:appCheck\/[a-z-]+|(?:permission-denied|unauthenticated|unavailable|network-request-failed|recaptcha-error|fetch-status-error)|\b[45]\d{2}\b)/gi) || [], digest: createHash('sha256').update(msg.text()).digest('hex') }); if (kind === 'chunk') check.chunkErrors.push('console chunk failure'); if (kind === 'api' && (msg.location().url.startsWith(new URL(base).origin + '/') || /firestore\.googleapis\.com|cloudfunctions\.net|firebaseappcheck\.googleapis\.com/.test(msg.location().url))) check.apiErrors.push('console API failure'); } });
    page.on('requestfailed', req => { const item = { url: safeUrl(req.url()), failure: req.failure()?.errorText, type: req.resourceType() }; check.network.push(item); if (req.resourceType() === 'script') check.chunkErrors.push(item); if (/firestore.googleapis.com|cloudfunctions.net|firebaseappcheck.googleapis.com/.test(req.url())) check.apiErrors.push(item); });
    page.on('response', response => {
      const url = response.url();
      const api = /firestore.googleapis.com|cloudfunctions.net|firebaseappcheck.googleapis.com/.test(url);
      const script = response.request().resourceType() === 'script';
      if (api || script || response.status() >= 400) check.network.push({ url: safeUrl(url), status: response.status(), type: response.request().resourceType() });
      if (api && response.status() >= 400) check.apiErrors.push({ url: safeUrl(url), status: response.status() });
      if (script && response.status() >= 400) check.chunkErrors.push({ url: safeUrl(url), status: response.status() });
      if (/getActivityDiscovery/.test(url) && response.ok()) pending.push(response.json().then(body => {
        const d = body.result ?? body.data;
        // Explicit successful empty discovery contract; HTTP 200 or an error envelope is insufficient.
        if (d && Array.isArray(d.items) && d.items.length === 0 && d.exhausted === true && d.nextCursor === null && d.totalCount === null && d.consistency === 'current_authorized_seek_pages' && d.order === 'startTime_desc' && d.includesUndated === false && Number.isFinite(d.expiresAt) && d.expiresAt > Date.now() && Number.isInteger(d.scannedCount) && d.scannedCount >= 0 && d.scannedCount <= 50) check.verifiedEmpty = true;
        if (body.error) check.apiErrors.push({ url: safeUrl(url), error: 'callable error envelope' });
      }).catch(() => check.apiErrors.push({ url: safeUrl(url), error: 'invalid JSON' })));
    });
    try {
      if (result.simulation === 'chunk') await page.route('**/*.js', route => route.abort('failed'));
      if (result.simulation === 'api') await page.route(/firestore.googleapis.com|cloudfunctions.net|firebaseappcheck.googleapis.com/, route => route.abort('failed'));
      const html = await context.request.get(`${base}/${locale}/?monitor=${runId}`, { headers: { 'Cache-Control': 'no-cache' } });
      const entry = (await html.text()).match(/(?:src=["']\/?)(assets\/index-[^"']+\.js)/)?.[1];
      if (entry) { const asset = await context.request.get(`${base}/${entry}`); if (!asset.ok()) check.chunkErrors.push('live entry HTTP failure'); result.live.push({ locale, entry, status: asset.status(), sha256: createHash('sha256').update(await asset.body()).digest('hex'), observedAt: new Date().toISOString() }); }
      else check.chunkErrors.push('missing live entry');
      const response = await page.goto(`${base}/${locale}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      check.httpStatus = response?.status();
      await page.locator('#root > *').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      await page.locator(`a[href^="/${locale}/activity/"], [role="alert"]`).or(page.getByText(locale === 'ko' ? '아직 활동이 없어요' : 'No activities yet', { exact: true })).first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(2000);
      check.rootVisible = await page.locator('#root > *').first().isVisible();
      const cards = page.locator(`a[href^="/${locale}/activity/"]`);
      check.cards = await cards.count();
      if (check.cards && !await cards.first().isVisible()) check.cards = 0;
      if (check.cards) check.cardContentVisible = await cards.first().evaluate(a => { const card = a.closest('article'); return !!card && (card.textContent?.trim().length || 0) > 20 && card.getBoundingClientRect().height > 0; });
      check.emptyVisible = await page.getByText(locale === 'ko' ? '아직 활동이 없어요' : 'No activities yet', { exact: true }).isVisible().catch(() => false);
      check.feedAlert = await page.locator('[role="alert"]').filter({ hasText: /활동|불러|Could not load|activities/i }).count() > 0;
      await Promise.allSettled(pending);
    } catch (error) { check.pageErrors.push({ category: 'navigation', message: error.name }); }
    check.state = classify(check);
    // Mask rider cards before evidence capture. No private account is used.
    if (!check.state.startsWith('healthy')) await page.screenshot({ path: join(dir, `${locale}.png`), mask: [page.locator('.mobile-activity-card, .activity-card, article')], timeout: 10000 }).catch(() => {});
    await writeFile(join(dir, `${locale}.json`), JSON.stringify(check, null, 2));
    await context.close();
  }
} catch (error) { result.runnerError = { name: error.name, message: 'Monitor infrastructure failure; see process stderr' }; console.error(error); }
finally { await browser?.close(); }
if (new Set(result.live.map(v => v.sha256)).size > 1) result.runnerError = { name: 'LiveVersionChanged', message: 'Live bundle changed during the two-locale check; rerun to obtain one consistent version' };
result.completedAt = new Date().toISOString();
result.status = result.checks.length === 2 && result.checks.every(c => c.state?.startsWith('healthy')) && !result.runnerError ? 'healthy' : 'failed';
await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2));
// Simulations never replace the real latest pointer.
const pointer = result.simulation ? 'latest-simulation.json' : 'latest.json';
await writeFile(join(out, `${pointer}.${runId}.tmp`), JSON.stringify({ ...result, evidenceDirectory: dir }, null, 2));
await rename(join(out, `${pointer}.${runId}.tmp`), join(out, pointer));
console.log(JSON.stringify({ status: result.status, completedAt: result.completedAt, result: join(dir, 'result.json'), states: result.checks.map(c => `${c.locale}:${c.state}`) }));
process.exitCode = result.status === 'healthy' ? 0 : 1;
