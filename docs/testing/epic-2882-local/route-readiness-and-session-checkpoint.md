# Local route readiness and session checkpoint

2026-10-26. Web product `a71b3041`, server product `8e921185` (read-gate test fixture follow-up `6a344fc7`). No push, merge, remote issue update or deployment. Existing local data services remain running.

## User-visible changes

- File import is bound to the originating Firebase SDK user/app and modal lifetime. Account replacement, dismissal and unmount abort the client request and discard old completion/error UI. A request already accepted by the server is not rolled back by client abort. Local browser evidence uses real Auth logout and an intercepted import transport; it does not prove server import processing.
- Exact notification comments focus once per destination. Periodic access checks preserve keyboard focus and the unsent composer text. Fourteen component tests and an actual 30-second local SDK refresh passed. The first browser attempt failed a combined assertion without diagnostic output; the saved repeat run passed and is not a reliability claim.
- Route inventory shows optional owner-wide history inspection counts and their date. Counts cover all years/sports independently of the selected route filter. A missing stored index does not establish missing source GPS. The UI retains `wholeHistory: unknown` and `personalBest: unavailable`.
- Route inventory also invalidates results when the actual SDK user object changes, including a new session with the same UID. AppCheck-delayed dispatch and old responses are fenced. Three focused suites / 25 tests passed, including readiness and session cases.

## Actual local evidence

External evidence root: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882`.

- `import-session/results.json`: actual local SDK logout clears dialog, file and completion; no old activity navigation. Import POST is intercepted, no server file write.
- `embedded-profile/comment-focus-results.json`: two exact-comment HTTP 200 responses, preserved focused composer and draft, zero page errors, no posted comment.
- `r5-inventory/readiness-seed-results.json`: actual bounded producer traversed ten synthetic owner activity documents; two stored owner-bound indices found, eight missing, capture completeness unproven for all ten. A single page was sufficient for this review fixture; multi-page/CAS/invalidation tests are separate server evidence.
- `r5-inventory/readiness-http-results.json`: both local Functions ports 5039 and 5029 returned 200 to the owner and 403 to another account without readiness content. Emulator unsigned credentials are not production signature verification.
- `r5-inventory/readiness-browser-results.json` and `readiness-mobile.png`: real app router, Auth SDK and HTTP response; counts displayed, zero page errors and no horizontal overflow at 390px. Screenshot opened and inspected.

Runtime snapshot source `60a51e00950d`, artifact `bf67d93039e9`. Wrapper replacement reloaded local Functions code; Firestore/Auth/Storage were not restarted. The wrapper does not register route-index background triggers; actual event delivery for the new invalidation hook is not claimed. The callable reads the producer's explicit inspection snapshot. Dedicated server tests exercise invalidation and concurrent transactions against Firestore.

## Verification and limits

Web a71b3041: **917 files / 9,667 tests passed**, 317.61 seconds. TypeScript, complete contracts, build:dev, full lint with zero warnings and quality budgets passed. Logs: `/tmp/orider-2882-readiness-web-{full,contracts,build,lint-all,quality}.log`. Server 6a344fc7: **933 files / 15,651 tests passed**, with **55 files / 541 opt-in tests skipped**, no failures, 105.65 seconds. Final log: `/tmp/orider-route-readiness-full-vitest-rerun.log`. Build integrity verification confirms the same source/artifact hashes after the fixture-only commit. Earlier full-suite counts are not applied to this source.

Server bounded producer / reader / trigger tests: 68 passed. Separate old-default-deny versus new-explicit-deny rules checks passed for owner/other/anonymous read, list and write. The first complete server run had one expected read-gate fingerprint fixture failure, preserved in `/tmp/orider-route-readiness-full-vitest.log`; the fixture-only update keeps the runtime artifact unchanged.

The producer is deliberately demo/loopback-only. It is a readiness inspection, not a production backfill, consistent owner-wide snapshot, capture-completeness witness, deduplication proof or PB reducer. Production migration, native terminal capture proof and actual-rider comparison remain unfinished. APP changes remain local; its focused Swift compilation passed after the actor annotation fix, but hosted XCTest still encounters an additional Firebase-dependent LTHR observer. That app follow-up does not block local web/server review and is not reported as passed.
