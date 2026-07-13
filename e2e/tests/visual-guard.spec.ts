import { test, expect } from '../fixtures/test-fixtures';
import type { Page } from '@playwright/test';

/**
 * 시각 가드 (#401) — 픽셀 스냅샷 없이 결정적으로 검증하는 시각 회귀 테스트.
 *
 * 390×844 / 768×1024 / 1440×900에서 화면별로 다음 완료 조건을 단언한다:
 *  1. 가로 넘침 없음 (scrollWidth ≤ viewport)
 *  2. 12px 미만 텍스트 없음 (모바일 접근성 하한)
 *  3. 44px 미만 인터랙션 없음 (::after 히트 오버레이 포함, 모바일만)
 *
 * 스냅샷 이미지 비교는 폰트/렌더러 차이로 플레이키해 의도적으로 쓰지 않는다.
 */

const ROUTES = ['/', '/fitness', '/discover', '/board', '/settings'] as const;
const SURFACE_MODES = [
  { locale: 'ko', colorScheme: 'light' },
  { locale: 'en', colorScheme: 'dark' },
] as const;
const SETTINGS_SECTIONS = [
  'account',
  'training',
  'equipment',
  'connections',
  'health_sources',
  'developer',
  'device',
  'app',
] as const;

interface VisualAudit {
  overflowX: boolean;
  overflowDetails: string[];
  smallTexts: string[];
  smallTargets: string[];
  unnamedIconTargets: string[];
}

async function mountLazySurfaces(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight, 600);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
    window.scrollTo(0, 0);
  });
}

async function auditPage(page: Page): Promise<VisualAudit> {
  return page.evaluate(() => {
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
    const overflowDetails = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1;
      })
      .slice(0, 10)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return `${el.tagName}.${el.className} [${Math.round(rect.left)}, ${Math.round(rect.right)}]`;
      });

    const smallTexts: string[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const p = walker.currentNode.parentElement;
      if (!p || seen.has(p) || !walker.currentNode.textContent?.trim()) continue;
      seen.add(p);
      const rect = p.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue; // 숨겨진 요소 제외
      const fs = parseFloat(getComputedStyle(p).fontSize);
      if (fs < 12) smallTexts.push(`${fs}px "${walker.currentNode.textContent!.trim().slice(0, 30)}"`);
    }

    const smallTargets: string[] = [];
    const unnamedIconTargets: string[] = [];
    const targetSelector = [
      'a',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    for (const el of document.querySelectorAll<HTMLElement>(targetSelector)) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      if (el.matches(':disabled,[aria-hidden="true"]') || el.closest('[aria-hidden="true"]')) continue;
      // ::after 히트 오버레이(.ds-btn / .ds-tap-target) 반영
      const after = getComputedStyle(el, '::after');
      let w = r.width;
      let h = r.height;
      if (after.content === '""' && after.position === 'absolute') {
        w = Math.max(w, parseFloat(after.width) || 0);
        h = Math.max(h, parseFloat(after.height) || 0);
      }
      if (w < 44 || h < 44) {
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
        smallTargets.push(`${Math.round(w)}x${Math.round(h)} ${el.tagName} "${label}"`);
      }

      const visibleText = (el.textContent || '').trim();
      const hasGraphic = el.querySelector('svg,img') != null;
      const requiresExplicitName = el.getAttribute('role') === 'switch';
      const hasAccessibleName = visibleText.length > 0
        || Boolean(el.getAttribute('aria-label'))
        || Boolean(el.getAttribute('aria-labelledby'))
        || Boolean(el.getAttribute('title'));
      if ((hasGraphic || requiresExplicitName) && !hasAccessibleName) {
        unnamedIconTargets.push(el.outerHTML.slice(0, 120));
      }
    }

    return { overflowX, overflowDetails, smallTexts, smallTargets, unnamedIconTargets };
  });
}

for (const route of ROUTES) {
  test.describe(`visual guard: ${route}`, () => {
    for (const mode of SURFACE_MODES) {
      test(`${mode.locale}/${mode.colorScheme}: hierarchy and accessibility on ${route}`, async ({ authenticatedPage: page }) => {
        await page.emulateMedia({ colorScheme: mode.colorScheme });
        const localizedRoute = `/${mode.locale}${route === '/' ? '/' : route}`;
        await page.goto(localizedRoute, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3500); // lazy 청크·데이터 로딩 안정화
        await mountLazySurfaces(page);

        const audit = await auditPage(page);

        expect(
          audit.overflowX,
          `가로 넘침: ${localizedRoute} (${audit.overflowDetails.join(' | ')})`,
        ).toBe(false);
        expect(audit.smallTexts, `12px 미만 텍스트 (${localizedRoute}): ${audit.smallTexts.join(' | ')}`).toEqual([]);
        expect(
          audit.unnamedIconTargets,
          `접근성 이름 없는 아이콘 타깃 (${localizedRoute}): ${audit.unnamedIconTargets.join(' | ')}`,
        ).toEqual([]);

        // 터치 타깃은 모바일 프로젝트에서만 강제 (데스크톱은 포인터 정밀도가 높음)
        if (test.info().project.name === 'mobile') {
          expect(
            audit.smallTargets,
            `44px 미만 인터랙션 (${localizedRoute}): ${audit.smallTargets.join(' | ')}`,
          ).toEqual([]);
        }
      });
    }
  });
}

test.describe('visual guard: mobile settings subpages', () => {
  for (const section of SETTINGS_SECTIONS) {
    test(`${section}: hierarchy and accessibility`, async ({ authenticatedPage: page }) => {
      test.skip(test.info().project.name !== 'mobile', 'Dedicated settings subpages are mobile-only');

      await page.goto(`/ko/settings?section=${section}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await mountLazySurfaces(page);

      const audit = await auditPage(page);
      expect(
        audit.overflowX,
        `가로 넘침: settings/${section} (${audit.overflowDetails.join(' | ')})`,
      ).toBe(false);
      expect(audit.smallTexts, `12px 미만 텍스트: settings/${section}`).toEqual([]);
      expect(audit.unnamedIconTargets, `접근성 이름 없는 아이콘: settings/${section}`).toEqual([]);
      expect(audit.smallTargets, `44px 미만 인터랙션: settings/${section}`).toEqual([]);
    });
  }
});
