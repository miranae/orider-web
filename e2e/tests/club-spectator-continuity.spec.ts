import { expect, test } from '@playwright/test';
test('find a friend once, return, and switch cameras without losing them', async ({page}) => {
  await page.route('https://api.mapbox.com/styles/**', route => route.fulfill({json: {version: 8, sources: {}, layers: [{id: 'background', type: 'background', paint: {'background-color': '#e6f0ea'}}]}}));
  await page.goto('/e2e/fixtures/club-spectator.html');
  const friend = page.getByRole('button', {name: '나래', exact: true});
  await friend.click();
  await page.getByRole('button', {name: '나래 팔로우', exact: true}).click();
  await page.getByRole('button', {name: /팔로우만 보기/}).click();
  await page.getByRole('textbox').fill('나래');
  await page.reload();
  await expect(friend).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox')).toHaveValue('나래');
  await expect(page.getByRole('button', {name: /팔로우만 보기/})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', {name: '솔바람', exact: true})).toHaveCount(0);
  await page.locator('.mapboxgl-popup-close-button').click();
  await page.waitForTimeout(2100); // The production page refreshes presentation time once a second.
  await expect(page.locator('.mapboxgl-popup')).toHaveCount(0);
  await expect(friend).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', {name: '코스 전체 보기', exact: true}).click();
  await expect(friend).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', {name: '친구 따라보기', exact: true}).click();
  await expect(friend).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', {name: '친구 따라보기', exact: true})).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
