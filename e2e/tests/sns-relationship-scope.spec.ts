import { test, expect, TEST_EMAIL, TEST_PASSWORD } from '../fixtures/test-fixtures';
import { signInUser } from '../fixtures/auth';

// 소식 관계 범위(나·친구 / 현재 동호회 / 전체 공개)와 공유 5탭 내비 — SNS P0 표시 개편.
// 동호회 범위는 내가 만든 동호회 2개 + 소식·모임을 에뮬레이터에 시드해 실제 조회 경로로 확인한다.

const FIRESTORE = 'http://localhost:8080/v1/projects/orider-g1/databases/(default)/documents';

function value(v: unknown): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  const fields: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) fields[k] = value(val);
  return { mapValue: { fields } };
}

async function put(path: string, data: Record<string, unknown>) {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) fields[k] = value(v);
  const resp = await fetch(`${FIRESTORE}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) throw new Error(`put ${path} failed: ${resp.status} ${await resp.text()}`);
}

test.beforeAll(async () => {
  const { localId: uid } = await signInUser(TEST_EMAIL, TEST_PASSWORD);
  const now = Date.now();
  for (const [id, name] of [['e2e-club-a', '한강 새벽 라이딩'], ['e2e-club-b', '북악 업힐 모임']] as const) {
    await put(`groups/${id}`, { name, creatorId: uid, isActive: true, memberCount: 3, description: '', inviteCode: id.toUpperCase() });
  }
  await put('groups/e2e-club-a/posts/p1', { authorId: uid, authorName: '테스트라이더', content: '이번 주 토요일 6시 출발합니다', kind: 'announcement', createdAt: now - 3600_000 });
  await put('events/e2e-event-a', { info: { name: '토요 정기 라이딩', groupId: 'e2e-club-a', status: 'OPEN', startTime: now + 2 * 86400_000, visibility: 'GROUP' } });
});

test('공유 내비 5개 탭이 같은 순서로 보인다', async ({ authenticatedPage: page }) => {
  await page.goto('/ko', { waitUntil: 'domcontentloaded' });
  // 데스크톱은 상단 nav, 모바일은 하단 탭바 — 각 화면에서 실제로 보이는 링크만 센다.
  for (const label of ['소식', '내 운동', '동호회', '탐색', '사람·교류']) {
    await expect(page.getByRole('navigation').getByRole('link', { name: label, exact: true }).filter({ visible: true })).toHaveCount(1);
  }
});

test('관계 범위 3개를 전환하고 현재 동호회 소식·모임을 읽는다', async ({ authenticatedPage: page }, testInfo) => {
  await page.goto('/ko', { waitUntil: 'domcontentloaded' });
  const scopes = page.getByRole('group', { name: '소식 범위' }).first();
  await expect(scopes.getByRole('button', { name: '나·친구' })).toBeVisible();
  await expect(scopes.getByRole('button', { name: '현재 동호회' })).toBeVisible();
  await expect(scopes.getByRole('button', { name: '전체 공개' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('scope-default.png') });

  await scopes.getByRole('button', { name: '현재 동호회' }).click();
  await expect(page).toHaveURL(/scope=club/);
  await expect(page.getByText('이번 주 토요일 6시 출발합니다')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('토요 정기 라이딩')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('scope-club-a.png') });

  // 다른 동호회로 전환하면 이전 동호회 소식이 남지 않는다.
  await page.getByRole('combobox').first().selectOption('e2e-club-b');
  await expect(page).toHaveURL(/club=e2e-club-b/);
  await expect(page.getByText('이번 주 토요일 6시 출발합니다')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('scope-club-b.png') });

  // 뒤로 가기로 원래 동호회 범위 복원.
  await page.goBack();
  await expect(page).toHaveURL(/club=e2e-club-a/);
  await expect(page.getByText('이번 주 토요일 6시 출발합니다')).toBeVisible({ timeout: 15000 });

  await scopes.getByRole('button', { name: '전체 공개' }).click();
  await expect(page).toHaveURL(/scope=all/);
  await page.screenshot({ path: testInfo.outputPath('scope-public.png') });
});
