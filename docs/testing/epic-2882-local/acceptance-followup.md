# Acceptance follow-up after the first local handoff

2026-10-26. The preceding handoff proved a working local slice, not every requirement in epic miranae/orider-g1-app#2882. This audit re-read the current epic through authenticated GitHub CLI (the connector returned 404), compared source and existing evidence, and continued local implementation. Remote writes, pushes, merges and deployment remain prohibited by the user's latest instruction. App implementation remains deferred.

## Additional completed local behavior

- **R1 photographs:** owner uploads now use bounded, idempotent server writes without Firebase bearer download tokens. Direct Storage access is denied. Public, feed, owner, profile, map and creator photo consumers use a photo reference and authorized byte reads; no native Storage URL fallback. Server checks current activity/photo access before and after pinned-generation byte reads. Imported activities can retain genuinely owner-uploaded photos through the same contract.
- **R1 browser lifetime:** only photos near the viewport load bytes; leaving the viewport, account/app changes, backgrounding and unmount revoke Blob URLs. Visible images check authorization every 30 seconds without downloading bytes again. Failed checks remove the image. The cadence is not a strict 30-second global guarantee: network/handler timeout contributes to worst-case removal delay. The synthetic browser observation was 30,003 ms. Missing individual photos remain an individual error with retry, while permission denial invalidates the public detail.
- **R2 same-time ordering:** home, search and local search merging now share startTime DESC / UTF-8 document ID DESC ordering, matching Firestore’s implicit document-name order. Snapshot cursors and buffered source frontiers remain unchanged. Equal-time cross-source pagination regression covers own/public/friend rows and 40 search results.
- **R2 year filter:** feed and server search use the same January 1 KST boundary, including when the browser is in another timezone. UTC-run focused regression: 148 tests passed.
- **R3 safety actions:** public detail now provides activity reporting, hiding and blocking with confirmation, cancellation, retry and account-bound responses. Successful hide/block removes detail and drafts. Home/search wait for and filter against persisted own hidden/blocked state, including restoration when the setting is removed. Actual browser checks passed nine cases with real callable 200 responses and snapshot-based restoration. All test moderation/following changes were restored.
- **R6 comparison continuity:** valid period, W/Wkg and duration inputs survive original-activity navigation and return in the same browser session. Scope includes Firebase app/project, owner and account creation. Aggregate results, health values and activity IDs are not persisted; users explicitly query again. Validation rejects invalid/future ranges and stale hydration cannot replace new input.
- **R7 club journey:** anonymous shared-club visitors now stay on public preview/login; the shared layout no longer forces anonymous onboarding. Invite retries read back existing active/pending state without another use/count/history write. Actual local router invitation → sign-in → club → joint ride → activity → first reaction passed; anonymous preview → sign-in → same club also passed. Fixed-dimension share_open/club_join outcomes are measured. See [club invite evidence](club-invite-journey.md) for source, emulator readback and OAuth/device limitations.
- Photo consumer follow-ups cover profile reference deduplication, owner projection/upload deduplication, photo deletion controls and removal of stale map popups. Existing provider-photo behavior remains distinct.

- **R2 representative photos:** owner select/clear/current indicator, revision conflicts and deleted-photo fallback are implemented locally. Actual browser and background-trigger/concurrent-write evidence is in [cover and power verification](cover-and-power-verification.md).
- **R4 public power:** canonical average/normalized power now carries estimated/measured/unknown provenance; zero remains distinct from missing. The same [verification record](cover-and-power-verification.md) explains conservative classification and actual mobile browser evidence.

## Earlier authoritative local evidence

Web product SHA `1fe01913` plus tests/mocks through `c8473585`; server `c03e505d`.

- Actual Storage: `full-stack/photo-storage-results.json`, 10/10 cases. Includes token bypass before explicit synthetic revocation, rejection afterward, private/block/delete checks, metadata-only access checks and eleven simultaneous uploads yielding ten registered photos.
- Actual browser: `full-app/secure-photo-browser-results.json`. Owner upload 200, owner/public image bytes 200, one photo (no duplicate), private-transition access check 403 and displayed photo removed in 30,003 ms; no page errors. Original visibility restored. Fixture photo remains on `ui-route-native-2` for review.
- Repaired synthetic gallery: `full-app/secure-gallery-results.json` returned seven photo references; scrolling requested all `p0`–`p6` through the real byte API with 200 responses and no page errors. Offscreen Blob images were released. A direct anonymous Storage media request for the new `p0.png` object returned 403.
- Actual safety browser: `r3-safety/photo-free/results.json`, nine checks; dedicated photo-free fixture avoids conflating missing historical synthetic objects with safety mutation results. Earlier failure artifacts are retained, including the fixed photo-not-found/activity-revocation bug and a harness condition that mistakenly waited for the blocked author's card.
- Server build/lint/compat, 86 targeted tests and Storage rules test passed. Web focused evidence includes 21 period-state tests, 108 photo-consumer tests, 101 safety tests, 21 profile-photo tests, 18 dedup/map tests and 9 missing/denied/offscreen-photo tests. These groups overlap; do not sum them into a unique total.
- The earlier 120-attempt latency result belongs to source `3933cd42`; it is not a measurement of the subsequent safety/photo changes.

Paths above are relative to `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882`.

## Combined follow-up gates

- Node 22 web full regression: **891 files / 9,467 tests passed**, followed by all contract suites. The initial full run exposed two older partial Firebase service mocks (16 failures); those mocks now satisfy the required auth/app contract, and the full rerun passed. Product authentication checks were not weakened.
- Current product build, full lint and quality budgets passed. Later changes after that build are tests and documentation only.
- The seven historical synthetic `ui-native-ride` photos had HTTPS fixture URLs but no actual Storage objects. They were replaced using the real bounded upload writer in the isolated demo project; the previous synthetic document snapshot and exact changed IDs are retained in `full-stack/demo-photo-before-byte-migration.json` and `demo-photo-byte-migration.json`. No production documents or tokens were touched.

## Still not satisfied

| Requirement | Evidence gap / next work |
|---|---|
| R1 historical photo revocation | Production bearer token revocation and old projection migration have not run. Local tests cannot prove old production URLs are revoked. A bounded inventory/explicit rollout is required when authorized. |
| R5 native repeat-route personal best | Observed geometry still has unknown complete coverage, so the two-route group demo does not prove a personal best or whole-history rank. The [coverage audit](native-route-coverage-audit.md) traces actual recorder/upload contracts: local FINISHED/checkpoint/failure state is not uploaded; finalized bytes do not prove capture completeness. A versioned recorder sequence/terminal-flush witness and whole-history index contract remain required. App work is deferred; no speculative verifier is added. Never promote unknown to complete for convenience. |
| R0/R8 paid comparison and release-wide QA | Real paid-Strava paired comparison, production latency/cost and physical-device evidence are absent. Local emulator measurements are not substitutes. Profile cover and strip can still make duplicate visible-photo byte requests; keep this cost explicit. |
| R9 beta/release decision | Real-rider recruitment, two-week observation, staged release, store versions and product-owner launch decision remain unperformed. No external contact is authorized by this local work. |

The goal and full epic remain open. No remote issue state is changed by this report.

## Latest combined local checkpoint

Web `1a014fe6`, server `8c04d91f`: 893 web files / 9,480 tests and all contract suites passed. Web full lint, quality budget and development build passed. Server build, full lint and compatibility checks passed. See [cover/power evidence](cover-and-power-verification.md) for actual browser, concurrency and background-trigger checks. These supersede earlier full-regression counts for this source; earlier performance measurements remain scoped to their original SHA.
