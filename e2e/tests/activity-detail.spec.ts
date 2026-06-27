import { test, expect } from '../fixtures/test-fixtures';
import { ACTIVITY_IDS } from '../fixtures/seed';

test.describe('Activity Detail', () => {
  // Activity detail requires Firestore getDoc which needs auth for security rules
  test('shows activity description and author', async ({ authenticatedPage: page }) => {
    await page.goto(`/activity/${ACTIVITY_IDS.publicRide}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await expect(page.getByText('한강 라이딩 즐거웠습니다')).toBeVisible();
    await expect(page.getByText('테스트라이더').first()).toBeVisible();
  });

  test('shows distance stats', async ({ authenticatedPage: page }) => {
    await page.goto(`/activity/${ACTIVITY_IDS.publicRide}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Distance: 42.5 km (42500m)
    await expect(page.getByText('42.5').first()).toBeVisible();
  });

  test('shows comments', async ({ authenticatedPage: page }) => {
    await page.goto(`/activity/${ACTIVITY_IDS.publicRide}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await expect(page.getByText('좋은 라이딩이네요!')).toBeVisible();
  });

  test('shows other user activity', async ({ authenticatedPage: page }) => {
    await page.goto(`/activity/${ACTIVITY_IDS.publicRide2}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await expect(page.getByText('북한산 힐클라임 도전')).toBeVisible();
  });

  test('anonymous user sees not-found for private activity', async ({ seededPage: page }) => {
    // Anonymous users cannot read private activities (Firestore rules deny)
    await page.goto(`/activity/${ACTIVITY_IDS.private}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await expect(page.getByText('활동을 찾을 수 없습니다')).toBeVisible();
  });
});
