import { test, expect } from '../fixtures/test-fixtures';
import type { Page } from '@playwright/test';

/**
 * 시각 가드 (#401) — 픽셀 스냅샷 없이 결정적으로 검증하는 시각 회귀 테스트.
 *
 * 화면별로 다음 완료 조건을 단언한다:
 *  1. 가로 넘침 없음 (scrollWidth ≤ viewport)
 *  2. 12px 미만 텍스트 없음 (모바일 접근성 하한)
 *  3. 44px 미만 인터랙션 없음 (::after 히트 오버레이 포함, 모바일만)
 *
 * 스냅샷 이미지 비교는 폰트/렌더러 차이로 플레이키해 의도적으로 쓰지 않는다.
 */

const ROUTES = ['/', '/fitness', '/discover', '/board', '/settings'];

interface VisualAudit {
  overflowX: boolean;
  smallTexts: string[];
  smallTargets: string[];
}

async function auditPage(page: Page): Promise<VisualAudit> {
  return page.evaluate(() => {
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1;

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
    for (const el of document.querySelectorAll<HTMLElement>('a,button,[role="button"],select,textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
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
    }

    return { overflowX, smallTexts, smallTargets };
  });
}

for (const route of ROUTES) {
  test.describe(`visual guard: ${route}`, () => {
    test(`no horizontal overflow / sub-12px text / sub-44px targets on ${route}`, async ({ authenticatedPage: page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500); // lazy 청크·데이터 로딩 안정화

      const audit = await auditPage(page);

      expect(audit.overflowX, `가로 넘침: ${route}`).toBe(false);
      expect(audit.smallTexts, `12px 미만 텍스트 (${route}): ${audit.smallTexts.join(' | ')}`).toEqual([]);

      // 터치 타깃은 모바일 프로젝트에서만 강제 (데스크톱은 포인터 정밀도가 높음)
      if (test.info().project.name === 'mobile') {
        expect(
          audit.smallTargets,
          `44px 미만 인터랙션 (${route}): ${audit.smallTargets.join(' | ')}`,
        ).toEqual([]);
      }
    });
  });
}
