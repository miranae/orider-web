# R6 hosted bike period entry

Base: `54b7c7e1`. This local WEB change does not depend on the subsequent server `504180fa` change, enable deployed flags, change endpoints, recompute activity metrics, or backfill results.

## Confirmed connection gap

`FitnessPage` renders `FitnessPeriodEvidence` in its `analysis-periods` section; `MobileFitnessPage` uses the same component for the mobile analysis section. However, the component returned `null` outside Stage or a local demo emulator. The existing `trainingAnalysisPeriodsAvailable("bike")` service already supports the explicitly enabled hosted bike capability. Thus a correctly configured hosted product had the existing power comparison but lost the period distance/time/elevation, load/PMC, zone and saved-result entry.

The component now uses that existing bike capability for its entry. Stage-only run/swim behavior stays unchanged. Authentication and the real Functions app/project/endpoint checks remain in the existing hook/service. No feature default is enabled.

## Existing features reused, not rebuilt

| User path | Existing implementation / scope |
| --- | --- |
| Four weeks / year-to-date / custom | `FitnessPeriodEvidence` → `trainingComparisonPeriods` / `trainingCalendarPeriod`: two completed KST 28-day windows; KST year-to-request-instant versus prior-year matching date; inclusive custom dates with exclusive timestamp end. Separate rolling power-skills definition remains in `PowerCurvePeriodsPanel`. |
| Explicit period load | `useTrainingAnalysisPeriods` → `loadTrainingAnalysisPeriods`; no selection means no request. The user action requests existing saved metrics, not source recalculation. |
| Partial / missing results | Existing totals retain null as “—”; truncated coverage is shown. `TrainingPeriodZonesPanel` retains sensor/context coverage and FTP/HR groups. |
| Stored snapshots | `BikePeriodSnapshotPanel`: complete bounded results offer history; truncated results additionally offer an explicit full-period snapshot action. Existing history selection, timestamps and preservation logic are unchanged. |
| Original activities | Existing W and W/kg winners use separate original-activity links in `PowerCurvePeriodsView`, `PowerDurationPeriodsView`, `BikeSnapshotDensePower`; distance observations likewise link their originals. |
| Training log and PMC | Existing `PeriodLoadEvidence` shows load availability/trend and a chosen KST day's training-log link with owner-bound return state. |

## Local verification

- RED: the new hosted entry regression fails on the base (1 failed / 7 passed), because the section is absent.
- GREEN: 9 focused suites / 184 tests pass, covering entry behavior, existing service endpoint boundaries, KST calendar, request/session hook, stored snapshot panel, load/log links and power comparison.
- Entry tests verify no request before the button, no Stage run options in the bike request, disabled capability and signed-out exclusion, Stage run/swim preservation, and existing stored-history/log links for complete and truncated responses.
- Initial TypeScript, scoped ESLint and quality budget pass on Node 22; the subsequent cumulative gate is recorded below.
- Raw local logs: `/Users/kyoungnam/Documents/Codex/2026-10-28/r6-web-period-entry/`.

## Evidence limits and review steps

This regression runs the real UI component with provider/router helpers and a mocked period hook; it is not a production HTTP or device result. Existing local demo evidence in `bike-period-ui-scale/README.md` proves the actual snapshot panel/SDK on older explicitly listed WEB/BE sources, not this hosted top-level entry. Its historical stop/discard description must not be read as the current stored-result policy.

For a later approved hosted/local product review: open the existing owner analysis page, select bike → period analysis, verify no period request before “기간 분석 불러오기”, load the chosen comparison, inspect partial coverage and stored results, then follow the existing chosen-day training-log link and return. Do not start a new full-period snapshot solely to demonstrate this entry. Real hosted configuration, real long-term history, mobile devices and production rollout remain unverified. No live demo service or dataset was changed by this task.

## Cumulative gate and isolated browser acceptance (2026-10-28)

At exact product HEAD `0c463c64ce958cb3f4cfa5ea871f6dc07e866be0`, Node 22.23.4:

- Full Vitest: **955 files / 10,169 tests passed**, 0 failed (maxWorkers=2, 328.97 seconds).
- `test:contracts`, `lint:budget`, `quality:budget`, and `build:dev`: exit 0. The generated tracked files remained unchanged.
- Dedicated mock browser fixture at 1280×900 and 390×900 renders the actual period component/children and the existing theme/i18n styles. The runtime has the hosted bike capability enabled; Auth and response hooks are explicit mocks. It proves the UI connection, not a live hosted endpoint or full application routing.
- Both widths: initial period reads 0 → explicit load 1; explicit stored-history action 1; training-log links 2; overflow false; page/HTTP errors 0. All non-fixture origins were blocked; no external requests were attempted.
- Visually checked `period-1280.png` and `period-390.png`: partial/missing values and stored-result controls remain visible. Existing adjacent summary/warning text is dense; this change does not claim a layout redesign.
- The temporary fixture listener was stopped. No shared Auth/Firestore/HTTP/Storage process or data was changed. Storage 9409 recovery was outside this task.

Evidence: `/Users/kyoungnam/Documents/Codex/2026-10-28/r6-web-period-entry/full-gate/results.json` and `ui/README.md`, `ui/ui-results.json`, `ui/period-1280.png`, `ui/period-390.png`. The earlier mock selector counter is preserved in `ui-initial-results.json`; the final counter uses the exact translated stored-history label. No production/device/reanalysis/backfill result is inferred from this fixture.

## R6 visual hierarchy follow-up

After reviewing the preceding browser captures, the product period section now separates headings, dates, totals, partial-coverage text and stored-result controls with existing DS typography/Stack and spacing/border tokens. Training-load evidence and its log-date action use separate period groups (two columns on desktop, stacked on mobile). Existing DS metric toggles wrap so the custom-date choice stays visible at 390px. The fixture header is unchanged and not a product design claim.

No query, snapshot, history selection, source value, coverage policy, endpoint, auth gate, auto-reanalysis or backfill behavior changes. Three focused suites / 20 tests, TypeScript, scoped ESLint and quality budget pass. Browser assertions at 390/1280 verify separate total/partial paragraphs, the custom-date action inside the viewport, no horizontal overflow, explicit period/history counts still 1 each, two training-log links, and no page/HTTP/external requests. Before PNGs remain `ui/period-*-before.png`; current PNGs are `ui/period-*.png` and `ui/load-*.png`. The 10,169-test full gate above remains evidence for the preceding product HEAD; it is not relabelled as a full test of this presentation follow-up.

## 최신 누적 로컬 게이트 (2026-10-28)

R6 시각 개선 `73dac49f`와 R7 초대 로그인 복구를 포함한 제품 HEAD
`88fac4a3118f811467e3277ef24c447c46fa557a`에서 Node **22.23.4**, worker **2**로 검사했다.
전체 Vitest **956 files / 10,172 tests PASS, 0 FAIL** (266.45초), `test:contracts`,
`lint:budget`, `quality:budget`, `build:dev` 모두 exit 0이다. 검증 전후 HEAD 동일,
tracked/untracked worktree 변경 없음. 이 문서 추가 커밋은 제품 코드를 바꾸지 않는다.

증거: `/Users/kyoungnam/Documents/Codex/2026-10-28/web-final-88fac4a3/results.json` 및
같은 디렉터리의 `vitest.log`, `contracts.log`, `lint.log`, `quality.log`, `build.log`.
이전 단계의 수치/실패 증거는 그대로 보존했다. 공유 에뮬레이터·브라우저 fixture 반복·
사용자 데이터/관계·분석 결과·백필·재계산·원격 push/PR/배포 변경은 없다.
이 게이트는 실제 OAuth/호스팅/실기기/운영 수용 검증을 대체하지 않는다.
