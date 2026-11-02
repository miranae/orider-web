# R8 Zod-only vendor split

Product DCO `8826bfff67208a4c34942451195210b1b61a9e2d` changes only two lines of `vite.config.ts`. Baseline source `fa3a4422`; baseline uses the unchanged previous sanitizer product-shaped artifact, with exact file hashes in artifact-binding.json. No schema, validator, library version, ACL, analysis result, or explicit reanalysis behavior changed.

## Dependency evidence

All 13 direct Zod importers are feature schemas/contracts: 9 coach/training contracts, deviceSettings/schema, useGoalFitnessInputs, club-preparation/segmentCatalog and domain. Their emitted consumers are lazy Settings/ClubMeeting/coach/goal features. Existing feed DTO validation does not use Zod. The new vendor-validation chunk has no imports and is not in the initial static import graph. **Desktop TodayStrip is a legitimate lazy Zod consumer**; desktop is not claimed to avoid this request.

Node22 gzip initial static graph: A index337880 + vendor202535 + Firebase183247 =723662B; F index337913 + vendor181774 + Firebase183246 =702933B. Difference -20729B. At200000B/s the new JS-only lower bound remains3.514665sec, excluding HTML/CSS/fonts/request latency: the2second target is still unmet. No Firebase/Auth/AppCheck shortcut was introduced.

## Separate same-seed A30/F30 sample

HTTP1.1/gzip,390x844,150ms latency,down200000B/s/up93750B/s,no CPU throttle. Fresh browser context with saved synthetic auth state, routing/cache disabled, backend warm. Fixed A then F order, not randomized; do not pool with previous90/30 samples or infer a hosted improvement percentage. First real card + enabled reaction + feed_first_content, followed by2sec observation.

A ready30/30,p505788.9ms,p955807.9ms. F ready30/30,p505680.3ms,p955700.7ms. The107.2ms p95 difference is only a local fixed-order observation. Both:2040requests/2040responses,2010finished,30Firestore Listen right-censored,HTTP errors0/requestfailed0/pageerrors0. These zeroes apply to observed responses; long-lived connections did not finish. All20 synthetic document hashes/updateTimes and seed identity stayed equal across variants. Mobile vendor-validation requests0 across the entire measured window, including before first card.

Median A JS response-end5565.467ms,discovery start5578.991ms,duration188.7325ms,render-after-discovery21.3835ms. F5449.858ms,5465.781ms,191.3845ms,24.1235ms. JS response-end is not JS execution complete. Script encoded-byte median814050→793284B includes dependent chunks/headers, unlike initial-static gzip.

## Lazy consumer and regression evidence

Existing12 suites/127 tests PASS (coach/training contracts, device schema, goal inputs, club domain/catalog). Actual built mobile feed→Settings: validation request0→1, settings heading/body displayed, compiled schema accepts valid payload and rejects invalid values/unknown key. HTTP/page errors0,externalBlocked0; no save/upload action. F-settings.png captured after finite animations and2RAF, visually inspected.

Initial desktop smoke falsely expected feed0 and therefore failed. Its actual result was feed validation1 and cumulative settings2 across full document navigation, with settings ready and all schema probes PASS,HTTP/page errors0. Preserved in validation-smoke-desktop-initial.json; this is a wrong harness assumption, not discarded evidence. Desktop first-card versus validation request timing was not captured and remains unproven. Desktop30-sample performance is not claimed. Initial screenshot was during page transition; final mobile screenshot waits for drawing.

## Boundaries and cleanup

11 HTTP-only local callables/triggers0/schedulers0, immutable older compiled backend snapshot ccb53376/sourceaba05ac7/artifactba4789. Demo AppCheck bypass is local wrapper only; production attestation and newest-server behavior are not established. HTTP2/Brotli/physical devices/production cache/media/owner-analysis are unmeasured. The text-only synthetic seed contains no metrics/AI/streams and causes no recalculation/backfill.

Browser closed; task-owned9349/8439/5079/5419 listeners0 after emulator shutdown. Shared services/original data untouched. No push/PR/deploy. Exact product8826bfff full gate PASS:958 suites/10178 tests,contracts/lint budget/quality budget/build:dev (including tsc) all exit0,Node22.23.4/workers2. Start/end SHA equal and finalStatus empty. APP received the clean exact product SHA and heavy slot afterward.

Evidence: comparison.json,A-results.json,F-results.json,artifact-binding.json,graph-result.json,prepare-results.json,validation-smoke-results.json,ui/F-settings.png,full-gate/results.json.

External evidence root: `/Users/kyoungnam/Documents/Codex/2026-10-29/r8-validation-chunk-split`.
