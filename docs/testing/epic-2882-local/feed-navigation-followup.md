# R2 feed history and account isolation (local only)

## Changes

History entries remember only how many feed/search results and cards were expanded. Activity payloads and Firestore cursors are not cached for restoration. Returning to the feed re-reads the requested depth with current query permissions and current hidden/block preferences. Explicit offline/cache-only snapshots are rejected as permission evidence. Search uses the same approach. URL scope/date/sport/query and existing per-account preferences remain authoritative.

Exact Firebase User object identity scopes request coalescing, pagination generation and restoration depth. This prevents an old load-more response from appending after the same UID receives a new authentication object. Navigation scroll history is likewise account scoped.

Feed cards provide a stable activity anchor. Back navigation restores its viewport offset while late content changes height, until the user interacts or the 10-second restoration window ends. Deleted/private anchors are never resurrected; the available list determines the fallback position.

Retention bounds: 50 history depth entries, up to 200 activities automatically re-read, with at most 20 additional feed pages or 10 search pages per restoration. More remains available manually. A history entry expanded beyond 200 activities is **not fully restored automatically**; this is a remaining limit of R2 acceptance, not a claim of unrestricted restoration. Remote permission changes are checked on the fresh query, not continuously by this history mechanism.

## Reproduction and evidence

Local Chrome 390×844, app5174 / real HTTP5039 / Firestore8398, synthetic project only. No response mocks. Temporary independent `r2-navigation-*` activities were backed up and restored/deleted, including descendants. Other agents' raw/period fixtures were unchanged.

- Baseline HEAD: 20 cards → public detail → Back reduced to 10 cards; scroll5279 → 2220. `baseline-results.json`.
- Fixed: same20 cards, scroll5279 → 5279, content height6235, every recorded card anchor rectangle equal before/after. Activated the focused activity link with Enter without browser click auto-scroll. `fixed-results.json`.
- Search: temporary25 matching activities, `q=r2navigation`, 20→25 expansion→detail→Back retained25, scroll6490 → 6490. `search-results.json`.
- Visibility: while viewing detail, a separate formerly public synthetic activity became private; returning re-queried and excluded it without resurrecting its cached row. `privacy-results.json`.
- Earlier read-only existing-data verification also covered profile→Back and viewer→owner SDK auth transition. Inline feed comments do not navigate.
- Same-UID regression run against baseline failed with `['all-new', 'old-scope-result']`; the new session guard removes that late response. Baseline replay regression also failed. `/tmp/orider-r2-baseline-regressions.log`.
- Tests cover fresh feed/search replay, old-session late responses, cached revoked rows, bounded session depth, and delayed anchor layout/user takeover.

Artifacts/scripts: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r2-navigation/`. Original initial HMR-contaminated and click-auto-scroll observations were not used as proof of exact restoration. Actual final runs completed without browser page errors.

No app changes, remote writes or deployment. Full production network/large-history/device coverage is not established by these local checks.

## User review fixture (intentionally retained)

After the regression fixtures were fully removed, the root requested a persistent local review set. `r2-review-fixture-01..15` now remain in the demo project, under the dedicated synthetic `r2-review-synthetic-rider` user document. Titles explicitly say `로컬 검토 라이딩 01..15 · 가상 데이터`; there are no real accounts or external images. Final performance measurements must state that these 15 extra activities are present.

Reproducible seed/cleanup script: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r2-navigation/review-fixtures.mjs`, invoked with Node22 and `seed` or `cleanup`. It pins localhost8398 and the demo project, refuses unrelated documents, and recursively removes only its tagged activity descendants on cleanup.

Final focused verification: 4 files / 148 tests passed; TypeScript and changed-file ESLint passed. Final whole-source gates remain the root's responsibility.
