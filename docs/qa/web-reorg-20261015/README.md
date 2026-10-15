# Web reorganization visual evidence / 웹 재배치 화면 증빙

Captured 2026-10-15 KST from the current Vite application in Chromium. Baseline source: `55a5d234c24bf9dda5dd9b9444440dab1da793c5`. `create-fixed-*` and the populated-plan captures also include the focused, then-uncommitted TopNav fix described below; the delivery PR records its final commit.

실제 현재 웹을 Chromium으로 캡처했습니다. 기본 소스는 위 SHA이며 `create-fixed-*`는 모바일 메뉴 후속 수정까지 포함합니다.

## Screenshots

| Surface / 화면 | Desktop 1440×900 | Mobile 390×844 |
| --- | --- | --- |
| Create menu after fix / 만들기 수정 후 | [Desktop](create-fixed-desktop.png) | [Mobile](create-fixed-mobile.png) |
| Coach conversation entry / 코치 대화 진입 | [Desktop](coach-desktop.png) | [Mobile](coach-mobile.png) |
| Empty plan / 계획 없음 | [Desktop](plan-desktop.png) | [Mobile](plan-mobile.png) |
| Populated plan / 계획 있음 | [Desktop](plan-populated-desktop.png) | [Mobile](plan-populated-mobile.png) |
| Import dialog, no file selected / 가져오기 모달 | [Desktop](import-desktop.png) | [Mobile](import-mobile.png) |

Additional evidence: [before menu fix](create-mobile-before.png), [390×500 scrollable menu](create-fixed-mobile-short.png), [320×568 menu](create-fixed-mobile-narrow.png), [plan scroll capture](plan-sticky-mobile.png), [machine-readable hit tests](menu-hit-tests.json).

## Focused correction and verification

The initial mobile create menu placed its final goal link behind the fixed bottom navigation. The initial populated-plan probe also found the rightmost top navigation control extending approximately 6 px beyond a 390 px viewport. TopNav now reserves bottom-navigation and safe-area space for its menu, limits menu height with scrolling on short screens, and uses smaller-screen spacing with the icon brand. Desktop menu positioning and spacing remain unchanged.

모바일 만들기 메뉴의 마지막 목표 링크가 하단 탭에 가려졌습니다. 화면 폭이 작은 경우 상단 마지막 버튼도 넘쳤습니다. 메뉴의 하단 여유·최대 높이·스크롤을 적용하고 작은 화면의 로고 및 간격을 조정했습니다.

Playwright independently hit-tested the center of all seven menu links after scrolling each into view at 1440×900, 390×844, 390×500 and 320×568. Every target was unobstructed; clicking the last goal link reached `/ko/coach/goals?new=1`. No document horizontal overflow at those four menu-check viewports. Existing TopNav tests: 4 passed. Focused ESLint: zero warnings/errors. A fresh populated-plan probe after the fix also measured document width 390 px for a 390 px viewport, with no overflowing elements. Scrolling the actual main container captured the sticky plan header.

## Fixture scope / 검증 범위

Only synthetic local Auth/Firestore accounts and a synthetic cycling goal/week were used, with isolated alternate-port emulators. Coach availability and empty conversation responses were stubbed. Screenshots contain no real user activity, delegated login URL, production credentials or account identifiers. They show real application rendering, not hand-built mockups. The empty home can retain loading/error placeholders for unsupported fixture endpoints.

No file was uploaded, no Storage or callable import success was exercised, no coach question was submitted, and no real device start/acknowledgment was tested. The import screenshot verifies dialog presentation only. Safe-area CSS is present, but a real iPhone inset was not emulated. This evidence supplements source/tests and does not establish production authenticated or device acceptance.

실제 계정·기록·위임 로그인 정보는 포함하지 않았습니다. 가져오기 성공·코치 질문 제출·실기기 시작 및 응답은 이번 화면 증빙의 범위에 포함되지 않습니다.
