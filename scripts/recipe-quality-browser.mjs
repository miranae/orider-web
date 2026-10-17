/** Synthetic local acceptance only. Usage: node scripts/recipe-quality-browser.mjs <backend-preview-dir> [evidence-dir] */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Provide synthetic backend preview directory');
const input = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3] ?? path.join(input, 'browser-evidence'));
await fs.mkdir(output, { recursive: true });
// A failed rerun must not leave a previous successful evidence manifest in place.
await fs.rm(path.join(output, 'evidence.json'), { force: true });
const sha256 = value => createHash('sha256').update(value).digest('hex');
const publicCardsInput = await fs.readFile(path.join(input, 'public-cards.json'), 'utf8');
const allCards = JSON.parse(publicCardsInput);
const cards = allCards.filter(item => item.card);
const encode = card => Buffer.from(JSON.stringify(card)).toString('base64url');
const caption = card => `${card.title.trim()}\n\n${card.metrics?.length ? `${card.metrics.map(m => `${m.label}: ${m.value}`).join(' · ')}\n\n` : ''}${card.body.trim()}\n\n${card.footer}\nORIDER · orider.co.kr`;
const evidence = { source: input, publicCardsSha256: sha256(publicCardsInput), inputRows: allCards.length, privateOnlyRows: allCards.filter(item => !item.card).length, assertions: [], reports: [], cards: [], downloads: [], productionRequests: [] };
const server = await createServer({ root, server: { host: '127.0.0.1', port: Number(process.env.RECIPE_QA_PORT ?? 5188), strictPort: true, open: false, hmr: false }, plugins: [{ name: 'synthetic-recipe-reports', configureServer(instance) {
  instance.middlewares.use('/__recipe_reports', async (req, res, next) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const name = path.basename(url.pathname);
      if (!name.endsWith('.html')) return next();
      const html = await fs.readFile(path.join(input, name), 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (url.searchParams.has('block-images')) res.setHeader('Content-Security-Policy', "img-src 'none'");
      res.end(html);
    } catch (error) { next(error); }
  });
} }] });
let browser;
try {
  await server.listen();
  const base = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, acceptDownloads: true });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base) || /^(data|blob):/.test(url)) return route.continue();
    evidence.productionRequests.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__recipeCspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.__recipeCspViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI }));
    window.__recipeClipboard = [];
    window.__recipeCopyFail = false;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => {
      if (window.__recipeCopyFail) throw new Error('Synthetic clipboard failure');
      window.__recipeClipboard.push(text);
    } } });
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      if (window.__recipePngFail) return callback(null);
      return original.call(this, callback, ...args);
    };
  });
  let fixtureLoaded = false;
  async function open(item) {
    if (!fixtureLoaded) {
      await page.goto(`${base}/e2e/fixtures/recipe-share.html?lang=${item.lang}#payload=${encode(item.card)}`);
      fixtureLoaded = true;
    } else {
      if (await page.getByTestId('post-state').count()) await page.getByRole('button', { name: 'Back to card' }).click();
      await page.locator('svg[role=img]').waitFor();
      await page.evaluate(detail => window.dispatchEvent(new CustomEvent('recipe-fixture-result', { detail })), { payload: encode(item.card), language: item.lang, ready: true, account: 'synthetic-owner' });
    }
    await page.locator('svg[role=img]').waitFor();
    await page.waitForFunction(title => document.querySelector('svg[role=img] > title')?.textContent === title, item.card.title);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('svg > title').textContent(), item.card.title);
  }
  async function download(name, photo) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: /^(PNG 저장|Save PNG)$/ }).click();
    const file = await pending;
    assert.equal(await file.failure(), null);
    const destination = path.join(output, name);
    await file.saveAs(destination);
    const bytes = await fs.readFile(destination);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), photo ? 1920 : 1350);
    evidence.downloads.push({ file: name, sha256: sha256(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length });
  }
  for (const item of cards) {
    await open(item);
    const bounds = await page.locator('svg[role=img]').evaluate(svg => {
      const view = svg.viewBox.baseVal;
      return [...svg.querySelectorAll('text')].map(text => {
        const box = text.getBBox();
        return { text: text.textContent, x: box.x, y: box.y, width: box.width, height: box.height, outside: box.x < 42 || box.x + box.width > view.width - 42 || box.y < 42 || box.y + box.height > view.height - 42 };
      });
    });
    assert.deepEqual(bounds.filter(box => box.outside), [], `${item.recipeId}/${item.state}/${item.lang}: text outside artwork`);
    const overlaps = bounds.flatMap((left, i) => bounds.slice(i + 1).filter(right => left.text && right.text && Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x) > 1 && Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y) > 1).map(right => [left.text, right.text]));
    assert.deepEqual(overlaps, [], `${item.recipeId}/${item.state}/${item.lang}: text overlaps ${JSON.stringify(bounds.filter(box => overlaps.flat().includes(box.text)))}`);
    const renderedCaption = await page.locator('svg[role=img]').evaluate(svg => {
      const photoOffset = svg.querySelector('image') ? 380 : 0;
      return [...svg.querySelectorAll('text')].filter(text => {
        const y = Number(text.getAttribute('y')) - photoOffset;
        return y >= (svg.querySelector('g') ? 565 : 407) && y < 748;
      }).map(text => text.textContent).join('');
    });
    const normalize = text => text.replace(/\s/g, '');
    assert.equal(normalize(renderedCaption), normalize(item.card.body), 'caption must render completely');
    assert.equal(await page.getByRole('alert').count(), 0, 'backend caption must fit completely');
    for (const metric of item.card.metrics ?? []) assert.ok(bounds.some(box => box.text === metric.label));
    assert.equal(await page.locator('svg[role=img] image').count(), item.card.imageDataUrl ? 1 : 0);
    if (item.card.imageDataUrl) {
      assert.equal(await page.locator('svg[role=img] image').getAttribute('href'), item.card.imageDataUrl);
      assert.ok(await page.evaluate(async src => { const image = new Image(); image.src = src; await image.decode(); return image.naturalWidth > 0; }, item.card.imageDataUrl), 'selected photo must decode');
    }

    const copy = page.getByRole('button', { name: /^(공유 문구 복사|Copy caption)$/ });
    await copy.click();
    assert.equal(await page.evaluate(() => window.__recipeClipboard.at(-1)), caption(item.card));
    await page.getByRole('link', { name: /^(게시글로 공유|Share as post)$/ }).click();
    const post = JSON.parse(await page.getByTestId('post-state').textContent());
    assert.equal(post.state.postTemplate.body, caption(item.card));
    assert.equal(post.state.postTemplate.title, item.card.title.trim());
    assert.equal(post.pathname, `/${item.lang}/community/board/write`);
    if (item.state === 'full' || item.state === 'edge' || item.state.startsWith('live') || (item.state === 'photo' && item.recipeId === 'ride-story')) {
      await open(item);
      const name = `public-${item.recipeId}-${item.state}-${item.lang}`;
      await page.screenshot({ path: path.join(output, `${name}-375.png`), fullPage: true });
      await download(`${name}.png`, Boolean(item.card.imageDataUrl));
    }
    evidence.cards.push({ recipeId: item.recipeId, state: item.state, lang: item.lang, dtoSha256: sha256(JSON.stringify(item.card)), textBounds: 'pass', exactClipboardAndDraft: 'pass' });
  }
  const item = cards.find(item => item.lang === 'ko' && item.state === 'full');
  assert.ok(item);
  await open(item);
  await page.evaluate(() => { window.__recipeCopyFail = true; });
  await page.getByRole('button', { name: '공유 문구 복사' }).click();
  await page.waitForFunction(() => document.body.dataset.exportError === 'copy');
  assert.equal(await page.getByRole('button', { name: '복사 완료' }).count(), 0);
  await page.evaluate(() => { window.__recipeCopyFail = false; });
  await page.getByRole('button', { name: '공유 문구 복사' }).click();
  await page.getByRole('button', { name: '복사 완료' }).waitFor();
  await page.evaluate(() => { window.__recipePngFail = true; });
  await page.getByRole('button', { name: 'PNG 저장' }).click();
  await page.waitForFunction(() => document.body.dataset.exportError === 'export');
  await page.evaluate(() => { window.__recipePngFail = false; });
  await download('png-retry-success.png', Boolean(item.card.imageDataUrl));
  evidence.assertions.push('clipboard failure recovers without false success', 'PNG failure releases loading and retry downloads a valid PNG');
  await page.getByRole('button', { name: '문구 편집' }).click();
  await page.getByLabel('공개 문구 (160자)').fill('수정한 공개 문구');
  const replacement = cards.find(item => item.lang === 'en' && item.state === 'full');
  await page.evaluate(detail => window.dispatchEvent(new CustomEvent('recipe-fixture-result', { detail })), { payload: encode(replacement.card), language: 'en', ready: true, account: 'synthetic-owner' });
  await page.getByRole('button', { name: 'Copy caption' }).click();
  assert.equal(await page.evaluate(() => window.__recipeClipboard.at(-1)), caption(replacement.card));
  await page.evaluate(detail => window.dispatchEvent(new CustomEvent('recipe-fixture-result', { detail })), { payload: encode(item.card), language: 'ko', ready: false, account: 'synthetic-next-owner' });
  assert.ok(await page.getByRole('button', { name: 'PNG 저장' }).isDisabled());
  assert.ok(await page.getByRole('button', { name: '공유 문구 복사' }).isDisabled());
  assert.equal(await page.getByRole('link', { name: '게시글로 공유' }).count(), 0);
  evidence.assertions.push('fresh result/language clears edited copy', 'account switch with pending result disables export/copy/post');
  const reports = (await fs.readdir(input)).filter(name => name.endsWith('.html') && !['index.html', 'gallery.html', 'acceptance.html'].includes(name));
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of reports) {
      await page.goto(`${base}/__recipe_reports/${name}`);
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.alt) }));
      assert.ok(layout.scroll <= layout.width, `${name}/${width} horizontal overflow`);
      assert.deepEqual(layout.brokenImages, [], `${name}/${width} broken image`);
      await page.screenshot({ path: path.join(output, `${name.slice(0, -5)}-${width}.png`), fullPage: true });
      evidence.reports.push({ file: name, viewport: width, sha256: sha256(await fs.readFile(path.join(input, name))), ...layout });
    }
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`${base}/__recipe_reports/ride-story-photo-ko.html?block-images=true`);
  const blocked = await page.evaluate(() => ({ source: 'ride-story-photo-ko.html', title: document.title, images: [...document.images].map(image => ({ alt: image.alt, blocked: !image.naturalWidth })), photoBackgrounds: [...document.querySelectorAll('[style]')].filter(element => element.style.backgroundImage.includes('data:image/')).length, violations: window.__recipeCspViolations }));
  assert.ok(blocked.photoBackgrounds > 0 || blocked.images.length > 0, 'Ride Story must contain a selected photo');
  assert.ok(blocked.violations.some(violation => violation.directive === 'img-src'), 'Ride Story photo must actually be blocked by CSP');
  assert.ok(blocked.images.every(image => image.blocked));
  await page.screenshot({ path: path.join(output, 'ride-story-photo-ko-images-blocked-375.png'), fullPage: true });
  evidence.blockedRideStory = blocked;
  evidence.assertions.push('actual Ride Story photo report retains text when CSP blocks all images');
  assert.deepEqual(evidence.productionRequests, [], 'fixture attempted external network');
  await fs.writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ cards: evidence.cards.length, reports: evidence.reports.length, assertions: evidence.assertions, output }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
