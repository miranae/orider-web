# Embedded public profile and follow — local verification

Product checkpoint: `037b672f` (includes `ab025aba`, `dd8bf85b`). All changes and checks are local. No push, deployment or production data access.

## User-visible behavior and authorization boundary

Activity authors and comment authors open a limited public profile inside the existing activity-public embed. Public activities open in the same component navigation stack; Back returns through the profile to the original detail. Unsupported destinations show an explicit message. Empty/whitespace author nicknames render the localized generic “Rider” label, preserving an accessible link without modifying the DTO.

The panel uses injected Firebase services and the existing authorized athlete discovery API. It does not mount `AthletePage`, read raw activity documents, use global profile Firebase access, show private owner tools, or fetch a canonical user biography. Its displayed name is an authorized activity DTO's author label, which may differ from a current canonical profile name. An empty result does not distinguish blocked, private, deleted or simply absent public activity.

The preflight `initialDetail` is used only before entering a child screen. Returning from a profile forces a fresh detail request, preventing stale map/privacy data from being restored. Child navigation no longer forwards `surface.ready/error` to the native host: the original handshake remains scoped to the requested surface and child errors retain the local Back control.

The existing subscription service and button accept optional injected services while preserving their normal standalone default. Summary and mutation bind the exact Firebase User instance and validate response target/state; replacing the SDK session, even with the same UID, discards the response and emits no subscription event for the old mutation. No self-subscription is offered. Embedded guests receive a sign-in instruction. Background entry invalidates pending UI work; foreground return reads the relationship again. Existing backend readiness flags remain required and were enabled only in the external local demo.

## Actual browser evidence

External harness: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/embedded-profile/`.

- Vite `http://127.0.0.1:5234`; actual Firebase SDK, Auth9309, Functions5039 and dedicated demo project `demo-orider-epic-2882-full`. Existing full-app5174 and shared services were not restarted.
- `journey.mjs` / `results.json`: header author → profile → activity → profile → original detail, plus comment author → profile → Back. Detail/discovery requests returned200; original-detail return made a new detail request; page errors0.
- A browser-intercepted403 verified fail-closed profile UI. This proves the error presentation, **not a new actual server block/ACL result**. Blocked/empty discovery, SDK/app replacement and delayed responses have focused component/service tests.
- `follow.mjs` / `follow-results.json`: original relationship=false; following inventory0 → UI subscribe200 → following inventory6 currently public target activities → UI unsubscribe200 → following inventory0. Each inventory exhausted its cursor. Original relationship=false restored. Eight HTTP responses200, page errors0.
- The runtime owner registered the two existing subscription exports from immutable artifact `3af663ebcd6b`, wrapper hash `b0906ba1269b`, with watcher reload only. Product server code and data-service processes were unchanged.
- `profile-mobile.png`, `permission-error-mobile.png`, `follow-mobile.png` were opened and visually inspected at390×844. Controls and text remain visible, and the failure screen exposes no previous profile/activity content while preserving Back.

The initial browser attempt exposed the empty author link rather than hiding it as fixture noise; the generic-name regression was fixed and the actual header journey rerun. Existing synthetic fixture map imagery can produce a recoverable external-image failure; successful external map rendering is not claimed.

## Checks

Focused checkpoints: bootstrap/profile60 tests; return/privacy/name50 tests; subscription/profile37 tests. Node22 targeted ESLint and TypeScript checks passed.

Final sequential combined validation at product `037b672f`, Node22.23.4:

| Gate | Result | Original local log |
| --- | --- | --- |
| `npm run test:vitest -- --maxWorkers=2` | 917 files / 9,638 tests PASS;284.48s | `/tmp/orider-embedded-follow-full-vitest.log` |
| `npm run test:contracts` | all contract suites PASS | `/tmp/orider-embedded-follow-contracts.log` |
| `npm run build:dev` | environment/token checks, TypeScript and Vite development build PASS | `/tmp/orider-embedded-follow-build.log` |
| `npm run lint:budget` | PASS, zero warnings | `/tmp/orider-embedded-follow-lint.log` |
| `npm run quality:budget` | PASS, no new design-system overrides | `/tmp/orider-embedded-follow-quality.log` |

All gates ran sequentially; Vitest used at most two workers while native work was running separately. No product repair or failed gate rerun was needed in this final pass. The full original Vitest log preserves jsdom `scrollTo` unsupported messages; these did not fail assertions. These are local correctness/build results, not a production performance benchmark.

## Limits

This is a browser component harness with real Firebase transports, not native WebView handshake/device-back testing. Emulator unsigned AppCheck tokens are not production AppCheck proof. Native following-tab implementation, physical-device journeys, beta behavior, production throughput, backend cold starts and deployment are outside this checkpoint. Earlier performance measurements apply only to their separately recorded source hashes.

## Subsequent exact-comment target increment

The public embed accepts an optional `commentId` query value (`[A-Za-z0-9_-]{1,200}`); duplicates, empty values and invalid/overlong IDs display the existing unavailable message without calling the comment API. Standalone web `?comment=` behavior remains supported. The shared exact-comment panel accepts explicit activity/comment props and uses the existing injected-services `getActivityPublicComment` contract. Embedded guests see the sign-in explanation without launching an unrelated web sign-in flow.

The target mounts only for the original activity. Profile/child-activity navigation removes it; Back to the original activity mounts it again and rechecks authorization. SDK replacement, including same UID, clears and discards pending content; foreground/safety refresh remains in effect. No new server or native surface contract was added by this WEB increment.

Separate focused evidence (does not replace the earlier037b672f full-suite checkpoint):3 suites /76 tests, ESLint and TypeScript passed. Actual component harness `comment-target.mjs` queried existing `ui-native-ride/comments/seed24`, displaying comment25 outside the preview's first3; profile navigation removed it and Back issued a second actual exact-comment request. A nonexistent target returned200/null and showed unavailable. Duplicate query made no comment request. Ten actual HTTP responses200, page errors0; no data mutations. `comment-target-results.json`, `exact-comment-mobile.png` and `unavailable-comment-mobile.png` are under the external embedded-profile evidence directory. The exact-comment screenshot was opened and checked: visible focused target precedes the activity. Missing-target evidence is not a deleted-fixture test; deleted/blocked responses are covered by focused panel tests. Native notification tap/handshake remains to be integrated and verified separately.
