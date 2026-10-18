# Activity detail review / 활동 상세 검수

## Scope

Review the complete activity detail journey: identity and actions, route map, primary and secondary statistics, navigation, overview, analysis, segments/laps, and owner-only comparison. Preserve the October 17 token system, Korean/English support, server values, ownership checks, sensor suppression, and release flags.

The header has compact actions, followed by sticky accessible tabs. Desktop uses a larger route with a compact statistics column; mobile presents three primary metrics, the map, and an optional disclosure for available secondary metrics. Route emphasis and endpoints apply only to activity detail. Ordinary tab selection preserves the viewport while updating URL/history and keyboard focus. Direct tab links and back navigation select the requested tab without scrolling to its heading. Explicit map, peak and lap location actions retain their targeted scrolling.

## Actual local runtime evidence

The supplied Strava activity was inspected with its stored data and a successful canonical overview response. The local setup uses an ignored public runtime configuration, a registered development App Check credential, and an explicit development-only loopback Firestore long-polling option. No credential or private runtime data is committed. Production App Check and Firestore defaults are unchanged.

Private screenshots remain outside this public repository. Desktop and actual 320px/390px same-origin frames were inspected; these render the application, not fixture screens. The browser viewport override did not alter the actual viewport, so frame dimensions were measured directly. English 320px had equal client and scroll widths.

Observed interactions include:

- Successful overview: stimulus, peak efforts, recovery/fuel, combined load, and fitness before/after values.
- Analysis: recent-90-day comparison expanded to its actual pending state; peak inspection changed to two minutes and selected the corresponding map interval. The successful 90-day comparison curve was not available and is not claimed as verified.
- Segments: five to seventeen to five rows, third-place result preserved, and a segment link opening the expected detail page. An empty lap table is suppressed.
- Comparison: selecting and changing previous rides, clearing selection, signed differences, lower charts, and source/zone qualifications.
- Mobile secondary statistics expansion, sticky tabs below the global header, direct tab URLs, and back navigation restoring the selected tab.

The accepted training load and stored analysis TSS are separate source values and may differ. Both values remain unchanged; overview identifies the load used for fitness/fatigue, analysis identifies its stored TSS, and a notice explains their different purposes. Stale analysis is explicitly described as a previous version. The UI does not invent the exact upstream reason for the difference. Only first-place segment efforts count as PRs.

No activity title, comments, privacy, Strava description, route creation, or AI submission was changed during inspection.

## Independent review — tooltip and map follow-up

The follow-up independently re-reviewed product commits `be92a53`, `015e54b` and the `7872ff3` dev synchronization. Earlier scores were not reused. Real application screenshots covered Korean 390px/1280px and English 320px in same-origin frames with measured layout widths; the frames contain the authenticated application rather than synthetic UI fixtures. Private screenshots and runtime assertions remain outside the public repository.

The first review withheld approval for two actual defects: long numeric values split across lines at English 320px, and sticky navigation obscured the selected segment banner. The final revision uses one metric column below 360px, preserves complete values and units, and measures sticky navigation clearance before scrolling to the selected segment. The final capture showed the selection text at 194px below the tabs ending at 122px.

| Reviewed surface | Planning | Design |
| --- | ---: | ---: |
| Whole page and navigation | 9.7 | 9.7 |
| Overview | 9.8 | 9.7 |
| Analysis | 9.7 | 9.7 |
| Segments/laps | 9.8 | 9.7 |
| Comparison | 9.7 | 9.7 |

Final independent verdict: **ACCEPT**, no required corrections outstanding in the observed scope. An independent source reviewer also approved the final corrections. These scores are reviewer judgments for the observed activity, states and viewports; they do not certify every sport, WebView, missing-data state, or the unavailable successful 90-day curve.

Verified follow-up behavior:

- Overview, analysis and comparison NP use the same text trigger, shared definition, title and body layout. Other analysis terms use the same structured explanation format. Personalized interpretation sheets retain their separate purpose.
- Generic training load no longer states that every load is TSS. The Threshold card describes its actual 95–106% FTP power band, distinct from a blood lactate test.
- Tooltip Escape, outside-click and tab-change dismissal were checked. Comparison was captured with the explanation closed as well as open.
- Segment detail links and map actions are separate. Click, Enter and Space select the segment, zoom its route, move focus to the map and expose its name and a return button. Return restores focus to the original segment action; account, activity or tab changes clear selection.
- The selected segment takes priority over previous lap/peak highlighting, marker and zoom ranges. Invalid coordinate ranges do not expose a map action.
- English 320px keeps `0:40:05`, `1.75` and `1.99` intact. Analysis and comparison document client and scroll widths both measured 320px.

## Verification

Regression coverage includes App Check/loopback configuration guards, tab keyboard/history behavior, metric preservation and grouping, stale/fractional load provenance, segment PR ranks, sparse secondary statistics, and compact share accessibility. The original pass completed `npm run build`, `lint:budget`, `quality:budget`, and `test:contracts`. The follow-up passed build, lint and quality budgets; final merge/promotion gates supply cumulative release verification. The full Vitest run passed 767 files / 8,293 tests using three workers and a 15-second test timeout. After the final sparse-stat correction, the affected page/statistics suites passed 107 tests; after moving the presentation cases to their own file, all 12 extracted cases passed separately. The full run began before that extraction, so the new file is covered by the separate run rather than counted as an additional full-suite file. Independent code review approved the final source and this document.

## Interaction and tooltip follow-up

Removed forced scrolling from ordinary tab clicks, keyboard selection, direct tab links, and history navigation. Keyboard focus uses `preventScroll`; explicit map/peak/lap location actions retain their intentional scrolling. Native pointer tests on the mobile application preserved a valid 90px scroll position across all four tabs; native keyboard navigation also preserved position, selection, URL, and focus. A shorter panel can naturally clamp the browser scroll position when the old position no longer exists.

Overview, analysis, metabolism, and comparison tooltip terms now use the same default `InfoTip` / `GlossaryProvider` accent-color trigger as Home. Activity-specific dotted-underline overrides were removed without changing the shared tooltip component or popup interaction. Runtime inspection confirmed no text decoration, and the TSS popup was opened and visually reviewed. Final focused suites passed 105 tab/page tests and 174 tooltip tests. Independent code review approved the correction; design review reapproved the observed page and four tabs at 9.7.

## 한국어

정상 개요 응답을 포함한 실활동으로 전체 페이지와 네 탭을 확인했습니다. 지도·상단 지표·고정 탭·공유 도구를 함께 개선하고, 기획과 디자인을 별도로 검수했습니다. 한국어 데스크톱·320/390px 및 영어 320px을 사용했습니다. 최근 90일 비교는 실제 분석 대기 상태까지만 확인했습니다. 계정 화면·정밀 위치 캡처·개발 인증 정보는 공개 저장소에 포함하지 않습니다.

## 후속 재검수

툴팁·지도 동선 후속 검수는 이전 점수를 재사용하지 않고 별도로 진행했습니다. 영문 320px 숫자 줄바꿈과 지도 안내 가림을 실제로 발견해 승인을 보류한 뒤 수정·재캡처했습니다. 최종 전체 페이지·개요·분석·구간·비교 모두 기획·디자인 각각 9.7 이상으로 ACCEPT 판정을 받았습니다. 비공개 스크린샷은 로컬 검수 폴더에만 보관합니다.
