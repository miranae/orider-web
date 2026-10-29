# R6 large-period UI: local evidence

## Implemented boundary

WEB `655fe654` adds the owner-only bike-period snapshot service, hook and panel to the existing period/power views. It uses the server's bounded pipeline; the browser sends at most one request at a time, stops after 2,000 steps or expiry, and does not automatically retry uncertain writes. Resume first reads status. Completion is required before totals or source winners appear.

The request deadline includes AppCheck readiness. Exact Firebase user object, app, Functions service and generation protect dispatch and late responses. Account replacement, access denial and invalidation discard results. Hidden/focus transitions mask results until status is checked. Oversized identity components have a distinct limitation message rather than an endlessly retryable connection error.

Distance/time/elevation totals retain missing/fallback counts. W and W/kg retain separate source links and stored calculation-weight provenance. Partial weight coverage remains explicit. The existing 85-duration grid is available when the server returns it; only the selected duration is persisted through the existing account-scoped period-control mechanism, not aggregate values. Dates are labeled KST. `5335e039` makes measurement and coverage text separate block paragraphs after actual mobile inspection.

## Focused verification

- `655fe654`: six suites, 109 tests; TypeScript and scoped ESLint passed. Suites cover the service, hook, new panel, existing power-period service and both integration panels.
- `5335e039`: panel four tests and scoped ESLint passed. These overlap the earlier panel tests; do not add the counts as independent tests.
- Parent-agent integrated full-suite/build results are recorded separately. No deployment or production enablement is implied.

## Actual SDK + UI, isolated local project

Review: <http://127.0.0.1:5264/>. External directory:
`/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/bike-period-ui-scale`.

The harness renders the actual product panel with actual Firebase Auth, AppCheck and Functions SDK. Dedicated Functions 5079/Auth 9329 use project `demo-bike-period-ui`; Firestore 8398 is a shared emulator process with a separate project namespace. Main 5029/5039, Auth 9309, other fixtures and R7 runtime are unchanged. Authentication namespace readback is saved in `auth-namespace-results.json`.

The 1,001 canonical-shaped documents are **directly seeded synthetic inputs**, not proof of recorder/import production. Two artificial 24-hour constant-power inputs provide all 85 durations; the preceding 999 have no dense curve or weight. This deliberately tests late-chunk availability and incomplete coverage, not plausible athletic performance.

Initial immutable `6d50eb755ff9` completed in 34.996 seconds with 258 successful callable responses, correct 1,001 km and separate W/Wkg winners, but lost the dense channel when it appeared only in the final chunk. `actual-before-dense-fold-results.json` preserves that defect. BE `498572b9` fixes internal snapshot counter collection/folding and starts new schema-2 runs; previous runs cannot recover counters they never stored.

With new immutable `a0913c1a20f6` (source `a14a7b402052`), `final-first-verified-results.json` records:

- One explicit start completed 1,001 representatives in **36.488 seconds**; 258 HTTP 200 responses including two zone-page reads, maximum one in flight.
- Distance 1,001,000 m; W winner 1,100 W and W/kg winner 1,000 W / 50 kg = 20 W/kg come from different records.
- All 85 selectable durations are present in W and W/kg; 999 missing dense records and 999 missing weights remain explicit/partial.
- 25 distinct FTP contexts are retrieved as 20 + 5, with no duplicated context IDs. Heart-rate evidence is absent rather than fabricated zero-duration sensor data.
- No page errors, request failures or horizontal overflow at 390 px. Single-viewport desktop/mobile images were visually reviewed. The earlier full-page stitching image is not final evidence.

This is a component + real SDK/server integration harness, **not** a full app-router source-activity round trip or production performance claim. Source-link targets are checked independently for W and W/kg. Main application integration is covered by focused panel tests; no fake callable responses are used here.

## Review and cleanup

Keep 5079/9329/5264 and the synthetic fixture available for review. `fixture-manifest.json` lists the exact owner, 1,001 activity/metrics IDs, period and expected values. `README.md` explains scope and instructions. From the external directory, Node 22 `node cleanup.cjs --execute` uses namespace/UID guards, the actual child-first private-snapshot purge helper and exact resource IDs. It does not delete other projects. Stop only the dedicated CLI/Vite processes after review; do not stop shared main emulators. No cleanup has been executed for this review fixture.
