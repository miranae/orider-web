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
