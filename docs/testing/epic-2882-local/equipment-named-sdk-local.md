# Equipment signal named SDK fix

Product182c8124 (parent6e4797aa), local only. Owner embedded `/public` uses the same ActivityPage. The prior EquipmentSignalCard imported default Firestore/Functions/AppCheck; when only named Firebase was initialized, `doc()` threw synchronously and unmounted the whole analysis tab. Original failure is copied into original-browser-failure.json (from the APP external preflight).

## Change

The card now uses useFirebaseServices (ordinary web retains context default). Owner identity also matches actual non-anonymous SDK user. Each read/result is bound to exact services/user/activity/owner/viewer scope; stale state is masked synchronously, listener/auth callbacks are invalidated and unsubscribed, and dismiss checks its scope before and after AppCheck/callable awaits. Synchronous subscription failures stay inside the card warning. No equipment schema or UI/design changed. No analysis calculation/history/public ACL policy changed.

ErrorLogger accepts an optional injected services argument, used only by this card, so error reporting does not fall back to unrelated default AppCheck/Functions. Existing callers keep existing defaults. A changed SDK user during pending AppCheck prevents stale error delivery.

## Tests

Focused4suites145PASS: EquipmentSignalCard, errorLogger, ActivityPage, ActivityPage.analysisSummary. Added owner named transport/AppCheck, non-owner SDK guard, same-UID named context replacement while AppCheck pending, old auth callback after replacement, late snapshot/callable after activity change, exact-user replacement, unmount cleanup and synchronous listener failure containment; injected logger user-replacement coverage. Typecheck/scoped lint PASS. Exact product182c8124 full gate PASS:958 suites/10185 tests,contracts/lint budget/quality budget/build:dev (including types) all0,Node22.23.4/workers2. Start/end HEAD equal and finalStatus empty.

## Actual browser scope

Own5449 copied the existing external named Firebase bootstrap/demo guards. Same synthetic native-saved-analysis-review owner, actual local Auth9359/Firestore8398/Functions5109, production card + ActivityPage. No default Firebase init, no production request. Headless Chromium, not iOS WK/physical-device evidence.

Analysis tab stays mounted(root1); history1 loads; previous result is selected and rendered(PDC200W/HR150); current return works. HTTP/page errors0, external requests0, reanalysis0/narrativeGenerate0. `browser-saved-selection.json` is the core PASS. Twelve source/copied document hashes before/after match. No metrics/AI recomputation, mutations, uploads, or backfill. Authentication handoff codes are transient local transport artifacts only.

Initial extra test expected version1, but actual preserved fixture is version41; that selector timeout is retained in browser-history-selector-failure.json and corrected to the actual listed saved result. No data was changed to match a test.

Same-UID `__localReplaceSession` completes and UID matches, but analysis/history are removed and remain absent. Two timeout observations plus final bounded diagnostic are preserved, not marked successful re-entry. Read-only classification: appHandoff.ts163-165 signs out before redeem; EmbeddedBootstrapRoot972-1001 clears session/authorization and increments selection generation on that null auth transition. Its final render shows Waiting for host authorization until host.authorize→auth.state→host.sessionAccepted (702-765). The external mock only sends authorize on bootstrap.ready, not on the later auth_uid_changed event. Thus this probe bypassed the required reauthorization contract. Observed root1/no old content/errors0 is consistent with fail-closed waiting; actual native host retry is not proved here. Unit tests independently verify exact-session stale response suppression.

PNG named-public-saved.png confirms stored metrics/control DOM, but this copied external Tailwind scan did not fully cover the external checkout (oversized logo/spacing); it is functional evidence, not a design acceptance screenshot. No product CSS was changed. All browser instances closed and own5449 stopped. Shared services remain untouched. No push/PR/deploy.

Evidence: binding.json,related.log,types-final.log,lint-final.log,full-gate/results.json,harness/browser-saved-selection.json,harness/browser-session-diagnostic.json,harness/witness-results.json. APP received exact182c8124 and heavy slot after all gates; native saved-selection retry is separate.

External evidence root: `/Users/kyoungnam/Documents/Codex/2026-10-29/equipment-named-sdk`.
