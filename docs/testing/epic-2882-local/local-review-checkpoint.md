# Local review checkpoints

## Endpoint map privacy and local acceptance continuation

2026-10-26. Server `663d0042`, source `fa358f202dee`, active local artifact `91bc5869dcfd`. Web product through `71615230`; subsequent final test fixture checkpoint is recorded below. No remote writes, pushes, merges, rule deployment or application deployment occurred.

- [Map privacy](map-privacy-followup.md): owner preview/save uses endpoint radii, revision checks and original-source witnesses. Protected public geometry cannot cross hidden endpoint areas; missing or changed source hides the entire public map. Original owner GPS/analysis remain intact. Existing derived map objects are removed in bounded, retryable batches; original streams/photos are untouched. This does not revoke copies already downloaded or prove production historical URL cleanup.
- Visible feed/profile/group maps and public detail revalidate current server geometry on focus/visibility and a 30-second cadence. Background/error states clear geometry. Requests are identity-scoped, batched up to 20 and have a whole-operation deadline. Browser scheduling/network suspension prevent a hard wall-clock guarantee.
- Actual isolated SDK/HTTP browser checks cover preview without persistence, saved 300m protection, nonowner coordinate omission, preserved owner originals, source-change fail-closed behavior, and already-open detail/feed 300m → 5000m hidden → 300m restored. The review fixture remains at 300m. Group selection, original-activity return and lack of false raw hover mapping passed.
- [Accessibility and recovery](public-ui-accessibility-recovery.md): 200% text, keyboard navigation, recoverable comment failures and comment-delete races were verified. Visual inspection found zero-height maps and missing group map-provider fallback; both were fixed. Public and group safe route SVGs have positive measured bounds and actual screenshots. This proves route-line fallback, not a successful Mapbox basemap.
- Server R5 inventory dry-run now supports bounded cursor continuation with no writes or object byte downloads. Actual five synthetic activities paged 2/2/1 with retry/resume and unchanged source timestamps. See the server `docs/analysis/native-route-backfill-plan.md`; this is not a production migration or proof of complete recorder history.
- [R9 beta plan](beta-execution-plan.md) defines proposed cohorts, 14-day tasks, denominators and stop/resume decisions. No recruitment, real-rider observation or staged release occurred.

Server Node 22 gates: **931 files / 15,646 tests passed**, **55 files / 539 opt-in tests skipped**; build, lint and compatibility passed. Separate actual Firestore/Storage checks passed 6 tests, direct Storage rules 1, Firestore policy 12 and upload race 6. These are overlapping runs and are not summed. Evidence is in external `map-privacy/` and the server verification document.

Final web checkpoint `7de2887e` (product `71615230`, test correction `5a6a3ebc`): **916 files / 9,609 tests passed**. Final development build, full lint and quality budget passed. All contract suites passed at the preceding `208f17d6` source boundary; subsequent changes were route rendering, component test fixtures and documentation, with no contract scripts changed. Logs: `/tmp/orider-2882-privacy-web-final-{rerun,build,lint,quality}.log` and `/tmp/orider-2882-privacy-final-web-contracts.log`.

The first final web run had 12 failures in ActivityCard/MobileFeedPage: mocks did not supply the new current-map API/readiness and DOM ancestry assertions depended on the old wrapper. Tests now await the actual contract and assert current-unavailable never restores cached geometry/images. No product privacy guard or timeout threshold was weakened. The complete rerun passed.

Runtime verification and actual Firestore ruleCoverage readback are recorded in external `map-privacy/rules-readback.json`; source and active rules hash matched `46c535dc81095c24a0875dad8c88260d9e31eddb4534d99b0e1bcc997c6b07e8`. Review links are in external `REVIEW.md`. Complete paid-Strava parity, production migration/performance, actual rider beta and deferred app acceptance remain unproven.

## Earlier public discovery, route inventory and settings continuation

2026-10-26. Product web through `79905e59`, followed by the friend-invite correction `55acd692` and nickname-boundary follow-ups through `c0100af1`. All work remains local.

- Public home/search/profile/group/co-rider/post-linked activity reads now use current-authorized server projections. Direct original activity/stream/public-metric reads are owner-only in the isolated demo. REST detail/streams also recheck current ownership, blocks, visibility and deletion/merge fences. The Firebase emulator automatically reloaded the local rule source; no remote rule deployment occurred.
- Public charts with incomplete bounded history suppress totals; private training load is not estimated from duration. Generated summaries are displayed only with validated stored revisions. See [public discovery migration](public-discovery-migration.md).
- [Route inventory](route-inventory-continuation.md) has bounded year-filtered continuation and original-activity return, without promoting uncertain capture/history coverage into personal-best eligibility.
- [Notification settings](notification-settings-followup.md) now persist through owner-bound APIs. Inbox access remains independent; external push/email delivery was not exercised.
- Friend-invite preview now uses a bounded code resolver rather than a prohibited original/public-document query. Responses contain only an allowed public profile, with current blocking/account checks. The final mutation also checks current fences and bilateral blocks.

### Combined local gates

- Node 22 web full regression: **909 files / 9,561 tests passed**, followed by all contract suites. Full lint, quality budget and final development build passed. Friend-invite's later added suites separately passed **3 files / 10 tests**; these overlap the main run and must not be added to a unique total.
- The first full web run failed 18 tests across five suites. Four suites had stale service/query mocks after the public API and notification-settings migration; fixtures were corrected without weakening product guards. The remaining EventParticipation timeout passed alone (60 tests) and in the complete four-worker rerun; no timeout threshold was increased.
- Final Functions source `ddacc947`: **929 files / 15,639 tests passed**, with **55 files / 535 opt-in tests skipped**. Node 22 build, full lint and compatibility passed. Separate real-Firestore/mirror checks passed ten tests. Build source hash `d95c55910ff3`, artifact `30e8d8c2cd13`; log `/tmp/be-friend-final-full.log`. Skipped cases are not counted as successes.
- Local review uses real Firebase SDK/HTTP paths and synthetic data. The home showed ten cards, a foreign profile five cards, and all four discovery requests returned 200 at 390 px with no page errors/overflow. Group selection, current-authorized co-riders and stored native streams were also exercised. These checks do not establish production cost, p95, complete-history ranking, device support or paid-Strava parity.

Logs: `/tmp/orider-2882-r1-web-{full-final,contracts-final,lint-final,quality-final,build-final}.log`. The review profile is intentionally retained using external `r1-discovery/review-profile.cjs apply|status|cleanup`, preserving prior fields and the R6 fixtures.

### Final running local snapshot

Immutable artifact `30e8d8c2cd13`, source `d95c55910ff3`, is active on the dedicated local stack. Final browser checks passed anonymous friend-code preview, current privacy revocation removing that preview, and owner detail narrative cache-only read. Resolver, discovery and narrative returned HTTP 200 with no browser errors; no model generation was requested. The 200/201-character nickname boundary passed a focused regression after the build; final TypeScript and lint checks also passed. Temporary invite fixtures were cleaned. See [group and invite verification](group-invite-followup.md). Evidence: external `r1-friend-browser/results.json` and screenshots. The deliberately persistent review profile, feed and period fixtures remain available.

## Earlier feed / period checkpoint

The checkpoint below remains historical evidence. Its timing measurements and source hashes are not measurements of the subsequent discovery changes.

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
