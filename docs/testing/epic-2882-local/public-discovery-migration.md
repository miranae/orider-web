# First-party public activity discovery

The web feed/search and foreign athlete profile now call `getActivityDiscovery` rather than reading original activity documents. Owner weekly statistics and owner profile source queries retain their authenticated owner paths. Public admission, following/friend relationships, blocked/deleted states and group context are server decisions; caller-provided relationship ID lists are not authority.

`activityDiscovery.ts` maps only the safe activity/content/map projection to card input. Canonical distance/time units are converted once; missing canonical values never fall back to recorded values. Private load, heart rate, thresholds, raw streams and external provider IDs are not reconstructed. The opaque presentation revision scopes memo/photo caches. Stored validated automatic summaries preserve their real formatter and input digest; authored memo retains precedence.

Feed start remains 3+7 with bounded manual continuation, current seek order and account/service fencing. An empty page can still continue. Expired or access-revoked continuation discards accumulated rows, while temporary network failures retain observations for retry. Return-depth hints contain only counts and require fresh server reads. There is no whole-history feed total claim.

Foreign athlete overview/search/list pages use the same safe projection. The chart inventory uses `id_asc`, including undated records in the observed total count. Undated records do not manufacture a 1970 year or an upload-month chart entry. Public aggregation stops after ten pages (up to 200 rows/500 scanned candidates); incomplete/changed inventory does not publish partial totals. Each page is currently authorized, not a fixed global historical snapshot. The profile explains this scope. Owner profile behavior remains separate.

Tests retired Firestore-query-partition and client-side relationship-admission expectations that no longer describe the public contract. Replacement tests exercise the actual service seam: correct scopes/filters, 3+7 and empty continuation, duplicates, late account/scope responses, access failures vs network failures, sharing/timeouts, fresh return replay, and server following admission. Owner weekly-statistics regression tests are retained. Actual browser and owner-only rule evidence must be read together with the local runtime version; no remote activation is included.

## Local browser verification

The final 390 px run used the real application router and Firebase SDK against `demo-orider-epic-2882-full`, immutable Functions snapshot `3c17abcee83c`, and the active owner-only original-activity rules (source/active hash `f8ffb8c7d1d9`, independently checked by the runtime agent). Home rendered ten cards and the foreign athlete profile rendered five cards; all four discovery calls returned HTTP 200, with no page errors or horizontal overflow. Evidence: `r1-discovery/results.json`, `home.png`, and `profile.png` in the external local evidence directory. A temporary explicitly synthetic public profile document was removed after verification; existing activities and the R6 review snapshot were preserved.

The browser exposed an additional regression: the public chart inferred TSS from duration when the safe DTO deliberately omitted private training load. Public profiles now leave load unknown instead of applying the owner's estimation path. A focused regression protects that distinction. At the inventory budget the profile displays a specific incomplete-history limit message, suppresses partial totals, and does not offer an endless network retry. The separate activity list remains pageable; a chart continuation design beyond this budget is not claimed complete.

No API transport was mocked for this browser check. These are synthetic local data and current seek-page observations, not production rollout or a complete historical snapshot guarantee.

Final focused verification: Node 22, eight suites / 171 tests passed; TypeScript `--noEmit`, focused ESLint, and diff whitespace checks passed. Broad integrated gates are coordinated by the parent task.
