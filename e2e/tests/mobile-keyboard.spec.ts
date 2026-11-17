import { expect, test, type Page } from '@playwright/test';

async function overlayKeyboard(page: Page, height: number, top = 0) {
  await page.evaluate(({ height, top }) => {
    const viewport = Object.assign(new EventTarget(), { height, width: innerWidth, offsetTop: top, offsetLeft: 0 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  }, { height, top });
}
async function panKeyboard(page: Page, height: number, top: number) {
  await page.evaluate(({ height, top }) => {
    Object.assign(window.visualViewport!, { height, offsetTop: top });
    window.visualViewport!.dispatchEvent(new Event('resize'));
    window.visualViewport!.dispatchEvent(new Event('scroll'));
  }, { height, top });
}

test('resize keyboard hides navigation and frees the fixed save bar only for editable controls', async ({ page }) => {
  await page.goto('/e2e/fixtures/mobile-keyboard.html');
  const nav = page.getByTestId('X1-1');
  await expect(nav).toBeVisible();
  await page.getByRole('textbox', { name: '일반 입력' }).focus();
  await page.setViewportSize({ width: 390, height: 300 });
  await expect(nav).toBeHidden();
  const input = page.getByRole('spinbutton', { name: '숫자 입력' });
  await input.fill('42');
  await input.evaluate(node => node.scrollIntoView({ block: 'end' }));
  await expect.poll(() => input.evaluate(node => {
    const r = node.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node;
  })).toBe(true);
  await page.getByRole('checkbox').focus();
  await expect(nav).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '변경 저장' }).focus();
  await expect(page.getByRole('button', { name: '변경 저장' })).toBeInViewport();
});

test('a save tap completes before input blur can relocate the action bar', async ({ page }) => {
  await page.goto('/e2e/fixtures/mobile-keyboard.html');
  const input = page.getByRole('textbox', { name: '일반 입력' });
  await input.fill('저장할 입력');
  await page.setViewportSize({ width: 390, height: 500 });
  const save = page.getByRole('button', { name: '변경 저장', exact: true });
  await save.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await expect(input).toBeFocused();
  await save.click();
  await expect(page.getByRole('status', { name: '저장 횟수' })).toHaveText('1');
  await input.focus();
  await save.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await save.tap();
  await expect(page.getByRole('status', { name: '저장 횟수' })).toHaveText('2');
  await expect(page.locator('[data-editing-action]')).toHaveCount(0);
  await page.getByRole('checkbox').focus();
  await save.tap();
  await expect(page.getByRole('status', { name: '저장 횟수' })).toHaveText('3');
});

for (const kind of ['run', 'swim']) {
  test(`${kind} goal input stays uncovered by wizard actions`, async ({ page }) => {
    await page.goto(`/e2e/fixtures/mobile-keyboard.html?kind=${kind}`);
    await page.getByRole('button', { name: '다음 →', exact: true }).click();
    const input = page.locator('input[type="number"]').first();
    await input.focus();
    await page.setViewportSize({ width: 390, height: 300 });
    await input.evaluate(node => node.scrollIntoView({ block: 'end' }));
    await expect.poll(() => input.evaluate(node => {
      const r = node.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node;
    })).toBe(true);
    await expect(page.getByTestId('X1-1')).toBeHidden();
  });
}

for (const prompt of [false, true]) {
  test(`${prompt ? 'prompt' : 'shared modal'} fits an overlay keyboard and follows viewport pan`, async ({ page }, info) => {
    await page.goto('/e2e/fixtures/mobile-keyboard.html');
    await overlayKeyboard(page, 300, 40);
    await page.getByRole('button', { name: prompt ? '긴 입력 확인창' : '입력 팝업', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const input = dialog.getByRole('textbox');
    await input.fill('한글 입력 확인');
    await input.evaluate(node => node.scrollIntoView({ block: 'nearest' }));
    const inBounds = () => dialog.evaluate(node => {
      const r = node.getBoundingClientRect(), v = window.visualViewport!;
      return r.top >= v.offsetTop - 1 && r.bottom <= v.offsetTop + v.height + 1;
    });
    await expect.poll(inBounds).toBe(true);
    await panKeyboard(page, 260, 140);
    await expect.poll(inBounds).toBe(true);
    await page.screenshot({ path: info.outputPath('overlay-keyboard.png') });
    await panKeyboard(page, 844, 0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('X1-1')).toBeVisible();
  });
}

for (const inline of [false, true]) test(`${inline ? 'inline' : 'portal'} date, time and selection stay within the visual viewport after keyboard pan`, async ({ page }) => {
  await page.goto(`/e2e/fixtures/mobile-keyboard.html${inline ? '?inline=1' : ''}`);
  await overlayKeyboard(page, 300, 40);
  for (const control of [page.getByRole('button', { name: /2030/ }), page.getByRole('button', { name: /오전 8:00/ }), page.getByRole('combobox')]) {
    await control.click();
    await panKeyboard(page, 260, 100);
    const popup = page.locator('[role="dialog"], [role="listbox"]').first();
    await expect(popup).toBeVisible();
    await expect.poll(() => popup.evaluate(node => {
      const r = node.getBoundingClientRect(), v = window.visualViewport!;
      return r.top >= v.offsetTop - 1 && r.bottom <= v.offsetTop + v.height + 1;
    })).toBe(true);
    await panKeyboard(page, 844, 0);
    await expect.poll(() => popup.evaluate(node => {
      const r = node.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    })).toBe(true);
    await page.keyboard.press('Escape');
  }
});
