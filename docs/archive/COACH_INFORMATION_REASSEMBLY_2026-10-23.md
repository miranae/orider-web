# Coach information structure and verification — 2026-10-23

Status: draft PR handoff, based on `dev` commit `0f190fd3`. Merge, automatic merge and deployment are outside this handoff. The two temporary standalone QA files remain local and are excluded from the PR.

## User tasks and ownership

| User question | Representative destination | Preserved access and evidence |
|---|---|---|
| What is my current condition? | Coach / Condition | Current load, recovery and historical context; zero, unknown, pending and failed states remain distinct |
| What did I plan, and what did I actually do? | Coach / Plan and records | Existing plan editor and complete activity log; selected date, sport, month and return path survive navigation |
| What should I adjust next? | Existing next-workout editor | Canonical execution status controls candidate selection, including future weeks; no plan is saved by verification |
| What changed over the selected period? | Coach / Analysis | Period performance, records and comparisons; explicit entry to specialist evidence |
| How was this individual activity performed? | Activity detail / Analysis | Individual pedaling and cadence evidence, including saved evidence without a raw stream |
| What is the target? | Coach / Goals | Consistent date status, readable full event titles, honest progress and cached-read retry |
| Which reference values are used? | Existing settings and FTP evidence | Original input/decision functions and old deep links remain available |

The general Coach surface no longer mounts a single-activity pedaling selector with an option for every activity. Activity lookup belongs in the existing log and activity detail. The log uses bounded display pages and honest search over the loaded month; this is not server-side global search or a new server-pagination claim.

## Stable interaction and shared controls

- General web details use explicit, URL-addressable entry and an overlay at mobile widths. Closing, browser back, reload, delayed content and unsupported detail routes are covered.
- Date/period selection and previous/next/today controls share the design system alignment and responsive layout.
- FTP history has a stable selected-value area. General web selection no longer adds/removes surrounding content; legacy embedded presentation stays on its existing branch.
- Help and term explanations use the shared `InfoTip`: **click, tap, Enter or Space only**. Hover/focus alone never opens a help popup. Focus indicators and accessible names remain.
- One help popup is open at a time. Explicit close, outside pointer, Escape, body scroll and navigation dismiss it. Close/Escape restores trigger focus. Long text stays within the viewport and its close action remains reachable.
- Help popovers owned by a Coach detail dialog remain inside that dialog's ARIA ownership and keyboard focus boundary.
- Integrated load focus and sport contribution keep labels and values visible. Information icons open overlays; pointer/focus no longer inserts a status paragraph below a card. Methodology also uses an explicit help overlay.
- Chart point tracking is separate from help. Existing touch selection, fixed selected values, keyboard navigation and source links are preserved.
- Native title explanations in performance-table missing states and running result time values use explicit help. The general-web goal title uses its existing full-title detail access; the legacy embedded title is preserved.

## Data truth and evidence

The frontend does not change training thresholds, load calculations, permissions or sufficiency grades.

The supplied `load_quality` requirement describes calculation quality, not an additional activity count. Its contract has an `unpredictable` guarantee and no numerical target. It can remain unmet when a long history contains estimated or mixed load calculation days. Precomputed load is not presented as proof of particular hardware.

The inline surface now shows every supplied requirement, including confirmed load days and history period, followed by the quality explanation and a route to inspect activity records. It explains that total activity count and a daily quality breakdown are not supplied by this requirement contract. A missing requirement description is shown as unavailable rather than invented. Delayed/processing results do not show stale conditions as current actionable requirements.

The record lookup and load-quality fixture values are synthetic. No personal activity export, account identifier, feedback image or production record is included in the PR.

## Verification

Final result counts and commands are recorded below after the validation run. The reproducible suites are:

```sh
npm run lint:budget
npm run quality:budget
npm run check:i18n
npm test
npm run build:dev
npx tsc --noEmit -p e2e/tsconfig.coach-layout.json
npx playwright test --config e2e/coach-layout.config.ts
JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home \
  firebase emulators:exec --project demo-orider-coach-local \
  --config e2e/coach-app-local.emulators.json --only auth,firestore \
  'npx playwright test --config e2e/coach-app-local.config.ts'
```

`coach-layout` uses synthetic components without an account or API and blocks external HTTP. One regression also checks the already-running local app's shared catalogue on loopback port 5194 after reload, so that suite expects the local preview to be running. It does not sign in or change account data. `coach-app-local` uses isolated demo Auth/Firestore emulators and the real application routes/models. It is not a production account, Firebase security-rules or real Functions/AI availability test.

Coverage includes 320/393/768px touch help, desktop mouse/keyboard, responsive detail and record flows, 0/1/1000 records, selected month/day/sport, bounded pages and back/reload, long titles/translations, empty/error/loading/delayed evidence, partial/completed/skipped/postponed plan states, and saved-only sensor evidence. Earlier independent reviews covered information ownership, accessibility and plan/record data truth; their concrete findings were resolved with regression tests.

## Handoff and limits

- Real authenticated account inspection, a physical phone, spoken screen-reader output, Safari and the native embedded host remain unverified. Browser responsive/touch emulation is not a physical-device claim.
- No sufficiency count/grade was recalculated from client activity totals; no stored data or user plan was changed.
- The shared click-help contract intentionally affects existing InfoTip callers outside Coach as well; their activation tests were updated without changing their save actions.
- The development preview remains available at `http://127.0.0.1:5194/ko/coach/condition`. A new in-app preview rendered successfully in the signed-out demo state; the former black tab's root cause remains unconfirmed.
- A separate UI session can continue detailed visual refinement and authenticated manual inspection. Server-level load-quality policy changes, global record search and a new training recommendation model are separate decisions.
- Before any future merge, run the repository merge gate. It currently refuses draft PRs; it has not been used to merge or deploy this draft.
- Stage deployment is triggered by a push to `dev`; production deployment by a version tag. The feature branch and dev-target draft PR do not trigger those workflows. The current GitHub CI/DCO/PR-gate workflows target `main`, so an empty check rollup on this draft is not a passing CI claim.

### Reviewed synthetic screens

- [Mobile load focus help](qa/coach-load-mobile-synthetic.png)
- [Desktop load focus help](qa/coach-load-desktop-synthetic.png)

Both screenshots are generated from `LoadHelpFixture`; the displayed numbers are invented test values, not the user feedback image or account records.

### Final validation results

| Check | Result |
|---|---|
| Complete Vitest | 848 files / 9,101 tests passed (`npm run test:vitest -- --maxWorkers=4`) |
| Contract scripts | Passed (`npm run test:contracts`) |
| Lint and quality budgets | Passed; no new frozen ownership exception |
| KO/EN resources | Key coverage passed |
| TypeScript and dev build | Passed; entry `index-DZCkptrt.js` |
| E2E fixture types | Passed |
| Responsive/URL/state/keyboard/touch fixture | 72 passed |
| Real app with isolated demo emulators | 52 passed; emulators stopped normally |
| Final explicit-help/5194/load-focus confirmation | 9 passed |
| Final history-period wording | 18 related sufficiency tests passed |

A resource-contention run hit the existing five-second limit in three 1,000-record DOM journeys. The full suite passed with four workers after concurrent heavy jobs completed; assertions and timeouts were not weakened. History-period completion is described as a met period requirement, not an exact first-record age or a guarantee that other quality conditions are satisfied.

The temporary `static-coach-qa.html` and `src/dev/staticCoachQa.tsx` files are preserved locally, excluded from the draft, and not dependencies of the committed fixtures. No environment file, account data, private feedback image or diagnostic log is included.
