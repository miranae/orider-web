# Activity detail review / 활동 상세 검수

## Scope

Review the complete activity detail journey: identity and actions, route map, primary and secondary statistics, navigation, overview, analysis, segments/laps, and owner-only comparison. Preserve the October 17 token system, Korean/English support, server values, ownership checks, sensor suppression, and release flags.

The header has compact actions, followed by sticky accessible tabs. Desktop uses a larger route with a compact statistics column; mobile presents three primary metrics, the map, and an optional disclosure for available secondary metrics. Route emphasis and endpoints apply only to activity detail. Tab selection scrolls the selected content into view and follows URL/history navigation.

## Actual local runtime evidence

The supplied Strava activity was inspected with its stored data and a successful canonical overview response. The local setup uses an ignored public runtime configuration, a registered development App Check credential, and an explicit development-only loopback Firestore long-polling option. No credential or private runtime data is committed. Production App Check and Firestore defaults are unchanged.

Private screenshots remain outside this public repository. Desktop and actual 320px/390px same-origin frames were inspected; these render the application, not fixture screens. The browser viewport override did not alter the actual viewport, so frame dimensions were measured directly. English 320px had equal client and scroll widths.

Observed interactions include:

- Successful overview: stimulus, peak efforts, recovery/fuel, combined load, and fitness before/after values.
- Analysis: recent-90-day comparison expanded to its actual pending state; peak inspection changed to two minutes and selected the corresponding map interval. The successful 90-day comparison curve was not available and is not claimed as verified.
- Segments: five to seventeen to five rows, third-place result preserved, and a segment link opening the expected detail page. An empty lap table is suppressed.
- Comparison: selecting and changing previous rides, clearing selection, signed differences, lower charts, and source/zone qualifications.
- Mobile secondary statistics expansion, sticky tabs below the global header, direct tab URLs, and back navigation restoring the selected tab.

The accepted training load and stored analysis TSS differ for this sample. Both values remain unchanged; overview identifies the load used for fitness/fatigue, analysis identifies its stored TSS, and a notice explains their different purposes. Stale analysis is explicitly described as a previous version. The UI does not invent the exact upstream reason for the difference. Only first-place segment efforts count as PRs.

No activity title, comments, privacy, Strava description, route creation, or AI submission was changed during inspection.

## Independent review

Planning and design were separate independent reviewer lanes, with iterative screenshot review after implementation. The final English correction separates fitness labels, values, and tracks and aligns the three primary metric values.

| Reviewed surface | Planning | Design |
| --- | ---: | ---: |
| Whole page, including header, map, statistics and navigation | 9.7 | 9.7 |
| Overview | 9.7 | 9.7 |
| Analysis | 9.7 | 9.7 |
| Segments/laps | 9.7 | 9.7 |
| Comparison | 9.7 | 9.7 |

Both reviewers approved the final observed screens with no required UI corrections outstanding. Scores apply to the observed sample and states; they do not certify unavailable backend states or all activities.

## Verification

Regression coverage includes App Check/loopback configuration guards, tab keyboard/history behavior, metric preservation and grouping, stale/fractional load provenance, segment PR ranks, sparse secondary statistics, and compact share accessibility. Final `npm run build`, `lint:budget`, `quality:budget`, and `test:contracts` passed. The full Vitest run passed 767 files / 8,293 tests using three workers and a 15-second test timeout. After the final sparse-stat correction, the affected page/statistics suites passed 107 tests; after moving the presentation cases to their own file, all 12 extracted cases passed separately. The full run began before that extraction, so the new file is covered by the separate run rather than counted as an additional full-suite file. Independent code review approved the final source and this document.

## 한국어

정상 개요 응답을 포함한 실활동으로 전체 페이지와 네 탭을 확인했습니다. 지도·상단 지표·고정 탭·공유 도구를 함께 개선하고, 기획과 디자인을 별도로 검수했습니다. 한국어 데스크톱·320/390px 및 영어 320px을 사용했습니다. 최근 90일 비교는 실제 분석 대기 상태까지만 확인했습니다. 계정 화면·정밀 위치 캡처·개발 인증 정보는 공개 저장소에 포함하지 않습니다.
