import { test, expect } from '../fixtures/test-fixtures';

test.describe('Explore / Segments', () => {
  test('shows page title', async ({ seededPage: page }) => {
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByRole('heading', { name: '리더보드' })).toBeVisible();
    await expect(page.getByText('세그먼트를 찾아보고')).toBeVisible();
  });

  test('shows segment list', async ({ seededPage: page }) => {
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByText('북한산 우이령길')).toBeVisible();
    await expect(page.getByText('남산 순환도로')).toBeVisible();
    await expect(page.getByText('한강 잠실-여의도')).toBeVisible();
  });

  test('has category filter buttons', async ({ seededPage: page }) => {
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByRole('button', { name: /전체/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /힐클라임/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /평지/ })).toBeVisible();
  });

  test('has search input', async ({ seededPage: page }) => {
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();
  });
});
