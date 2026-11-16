import { test, expect } from '../fixtures/test-fixtures';

// 현재 탐색은 Firestore 목록이 아닌 배포된 타일 JSON 계약을 사용합니다.
// 지도/스토리지의 외부 네트워크 없이 실제 목록·검색·필터 UI를 검증합니다.
const segments = [
  { id: 'seg-climb-001', name: '북한산 우이령길', distance: 4200, climbCategory: 3 },
  { id: 'seg-climb-002', name: '남산 순환도로', distance: 3600, climbCategory: 2 },
  { id: 'seg-flat-001', name: '한강 잠실-여의도', distance: 18000, climbCategory: 0 },
].map(item => ({ ...item, averageGrade: item.climbCategory ? 5 : 0, maximumGrade: 8,
  elevationHigh: 400, elevationLow: 20, startLatlng: [37.55, 127.0], gh: 'wyd', discipline: 'bike' }));

test.describe('Explore / Segments', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/segments/tiles/overview.json*', route => route.fulfill({ json: { v: 2, ts: Date.now(), count: segments.length, segments } }));
    await page.route('**/segments/tiles/regions/*.json', route => route.fulfill({ json: { v: 2, ts: Date.now(), polylines: {} } }));
  });

  test('shows the canonical segment page', async ({ seededPage: page }) => {
    await page.goto('/ko/explore/segments', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '세그먼트', exact: true })).toBeVisible();
    await expect(page.getByText('세그먼트를 찾아보고 도전해보세요')).toBeVisible();
  });

  test('searches the tile-backed segment list', async ({ seededPage: page }) => {
    await page.goto('/ko/explore/segments');
    const input = page.getByRole('textbox', { name: '세그먼트 이름 또는 지역' });
    await input.fill('북한산');
    await input.press('Enter');
    await expect(page.getByText('북한산 우이령길', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('한강 잠실-여의도', { exact: true })).toHaveCount(0);
  });

  test('category filtering excludes non-matching segments', async ({ seededPage: page }) => {
    await page.goto('/ko/explore/segments');
    await page.getByRole('button', { name: '평지', exact: true }).click();
    await expect(page.getByRole('button', { name: '평지', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // 검색 모드는 지도 범위와 독립적으로 필터된 전체 목록을 표시합니다.
    await page.getByRole('textbox', { name: '세그먼트 이름 또는 지역' }).fill('한강');
    await page.getByRole('button', { name: '세그먼트 검색', exact: true }).click();
    await expect(page.getByText('한강 잠실-여의도', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('북한산 우이령길', { exact: true })).toHaveCount(0);
  });
});
