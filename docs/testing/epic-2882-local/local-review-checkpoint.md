# Latest local review checkpoint

2026-10-26. Web product `71b3a57c`, backend product `d759a635` (documentation through `f3eb7e8d`). No remote writes, pushes, merges or deployments.

## Implemented and verified

- [Feed navigation](feed-navigation-followup.md): current-authorized replay of expanded feed/search pages, exact authentication-session isolation, stable card-position restoration. Actual 20-card feed and 25-result search restored the same card coordinates; privacy changes removed revoked cards. Automatic restoration is capped at 200 records.
- [Period load and log](period-load-connection.md): desktop/mobile selected-period canonical training load, completed-day observations for YTD, existing PMC and owner-bound log return. Unknown days, UTC histories and partial days are not promoted to complete KST totals. Actual browser six flows plus expanded chart passed; synthetic lifecycle fixtures are UI evidence, not producer evidence.
- Backend period power, training periods and training history now require matching root metrics ownership and reject conflicting nested ownership. Actual Firestore reproduced the former erroneous 777 W response from three invalid ownership shapes; fixed readers withhold it while valid legacy/V3 ownership still works. See backend `docs/testing/epic-2882-metrics-owner/verification.md`.
- Actual 1,001-record history verifies scan boundaries, half-open KST periods, missing/incomplete metrics and deletion. Linked-source tests retain existing maximum-versus-additive population definitions. Backend `docs/analysis/period-long-history-local.md` records the evidence and limits.

## Combined gates

- Node 22 web: **900 files / 9,528 tests passed**, all contract suites passed. Full lint, development build and quality budget passed. The final built bundle includes the clarified completed-day wording.
- First full web run found one real regression: a first visit without saved navigation depth unnecessarily replayed additional pages. `c73e3180` restricts replay to saved depth, preserves empty-page/has-more behavior, and the complete rerun passed.
- Node 22 Functions: **925 files / 15,586 tests passed**, **53 files / 532 opt-in tests skipped**. Build, full lint and compatibility passed. Separate linked/long-history emulator tests: 2 files / 3 tests passed; skipped cases are not counted as passed.
- Local Functions now execute an immutable compiled/dependency snapshot, without loading checkout build output. Artifact `93a5bc999f0e`, source hash `86bc39e1ca4c`. Actual `ensureFitnessCurves` and `revalidateTraining` callables are included; scheduled handlers are not registered. HTTP, authorization and background-trigger checks: 23 passed. Shared emulator processes/data were preserved. Concurrent clean-build stress was not run.

Logs: `/tmp/orider-2882-navigation-period-web-{full-final,lint,build,quality-final}.log`; `/tmp/orider-2882-owner-final-full-tests.log`. External artifacts root: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882`.

## Latest local browser measurement

Source stayed clean and unchanged throughout both measurements. Chrome headless 390×844, unthrottled loopback, warm synthetic emulators. Each trial made exactly one main-document request. Render timing ends at the first feed card or owner-analysis zone timeline; it does not imply every background request has finished.

| Rapid repeat condition | Render attempts | p95 |
|---|---:|---:|
| Feed, fresh browser context | 30/30 | 457 ms |
| Feed, same-context reload | 30/30 | 284 ms |
| Owner analysis, fresh browser context | 30/30 | 995 ms |
| Owner analysis, same-context reload | 30/30 | 900 ms |

The rapid run had zero page errors **but 40 notification HTTP 429 responses** from the existing local 10-requests/10-second limiter. It is not an error-free whole-page/API result. All attempts and responses are retained in `full-app/local-flow-benchmark-latest-results.json`; no limit was weakened.

A separate control with three seconds between trials completed **20/20 renders, zero page errors and zero local Functions HTTP errors**. Its five samples per condition are a small control, not a production percentile estimate. See `full-app/local-flow-benchmark-paced-results.json`. The feed includes 15 explicitly synthetic review rides; the paced control also has the review-only period snapshot. Different fixtures and source versions prevent a controlled speedup claim against the earlier benchmark.

## Review and remaining scope

Open http://localhost:5174/ko/ . The external `REVIEW.md` provides direct feed/activity/period/club links and seed/cleanup instructions. Fifteen synthetic review rides and an explicitly synthetic KST period snapshot remain available. The latter is backed up and is not a claim about the real load producer; a forced recalculation may replace it.

The [remaining epic acceptance](acceptance-followup.md) still applies: app notification migration, native capture/whole-history completeness, historical production migration, real-user/paid-Strava comparison and beta/release evidence are not completed here. Non-KST historical load needs an explicit backend rebucketing contract; bounded feed restoration is not unlimited. This local review does not close the full epic.
