# Bounded owner route inventory continuation

This local-only addition keeps the existing fixed cohort comparison contract unchanged. It adds `matched_route_inventory_page` for exploring the stored owner route index with a KST year filter and opaque `mrgi1.` continuation. It does not establish native recording completeness, personal records, or complete account history.

## Semantics and user flow

- Activity → owner Compare tab → “기준 활동과 경로가 유사한 기록 탐색”. Opening the panel or editing a filter does not fetch. A user explicitly starts or continues.
- Each request scans at most five descriptors and validates at most those five sources plus the anchor. The year filter uses validated activity start time in KST. An empty matching page may still have a continuation; the UI explains this and keeps Next available.
- Each discovered activity matches the anchor independently. Pages are not combined into a complete-link cluster. All rows remain ineligible for ranking and the response has no summary/personal-best result.
- Exhaustion means the selected stored-index snapshot ended, not that every recorded activity was indexed. Unknown coverage remains unknown.
- Source links use SPA navigation and an owner-bound internal return destination. Return restores Compare tab and account-scoped UI hints (year, policy, expanded state). Results/cursors/metrics are never stored; a fresh explicit read is required after return/reload.
- Account, SDK project/app, activity/source head, year, or policy change clears results. Expired cursors clear after 30 minutes. An in-app activity-content-change event clears the whole inventory, including pending requests. Access/source/cursor failures discard accumulated rows; transient network errors preserve observations for retry.
- Each page is checked when read. Earlier pages are not continuously revalidated by later requests. The UI states the observation date and manual-refresh boundary for changes made outside this app.

## Validation

Node 22: inventory service/hook and existing group/index suites: 55 tests passed. New UI controls/empty continuation/owner return suite: 3 tests passed. TypeScript and focused ESLint passed. Tests cover mismatched cursor families, year/rank/IO escalation, stable snapshots, duplicate rows, expiry, delayed results after account/head/year/in-app mutation, network retry, and no automatic initial reads.

Actual local Firebase SDK/browser evidence is recorded separately after the matching server snapshot is active. Synthetic data is not recorder coverage evidence. No remote deployment or production activation is included.

## Actual local browser readback

On 2026-10-26, immutable server artifact `17883b274ee2` served six actual `getActivityStreams` inventory requests through the app's Firebase SDK. A dedicated `r5-review-inventory-*` namespace contained 26 synthetic native unknown-coverage descriptors: ten in KST 2025 (including the anchor), sixteen in KST 2026. Selecting 2026 produced an empty initial page with continuation, then six pages with sixteen unique source links. Source navigation and the explicit return link restored year 2026 and the expanded Compare panel; no result/cursor was restored. The next read remained explicit. At 390px there was no horizontal overflow. Evidence: external `r5-inventory/results.json`, `mobile.png`, `desktop-return.png`, reproducible `seed.cjs`/`browser.mjs`. The temporary 26 activities, stream/fence/index documents and Storage objects were cleaned up; existing native/period/review fixtures were not edited.

This browser check caught and fixed a loading-skeleton null access in the new return slot and a cursor validator mismatch: the signed cursor is `mrgi1.payload.signature`, not a single base64url segment. The ActivityPage and panel regression run passed 92 tests; the corrected inventory service/hook/panel run passed 16 tests. One unrelated static asset 404 was logged; all six inventory callable responses were 200. This is actual local transport/UI evidence with directly seeded descriptors, not proof of the recorder index producer or production history completeness.
