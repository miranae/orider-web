# R3 notification settings — local follow-up

Local product commits: WEB `08ff756f`, BE `1672e2b2`, registration `6d03acec`.
No remote changes or deployed behavior are claimed.

## Existing meanings preserved

Settings → Account exposes the existing general push master, kudos/comment type
preferences, and weekly digest email opt-in. Push disabled still stores the inbox;
type settings survive master changes. Weekly email is independent and defaults OFF.
The UI scopes the push control to general notifications: emergency and some
club/event notification paths are separate. Browser/device permission is unchanged.

`getNotificationPreferences` and `setNotificationPreferences` require authenticated
nonanonymous owner context and AppCheck. The setter accepts only known boolean
keys, preserves unrelated type preferences, and normalizes matching legacy keys.
Transactions reject account deletion/merge fences. The WEB client captures the
exact SDK User object; same-UID replacement invalidates prior state and responses.
Network errors retain confirmed settings; authorization errors clear them.

The digest scheduler already selected explicit opt-ins. It now rechecks current
opt-in, email identity, and account fences immediately before its sender callback.
A cancellation does not send; a failed pre-send read releases its delivery claim.
External delivery after the final check remains an asynchronous boundary, and this
work does not claim recall of already-sent email or exactly-once external delivery.

## Evidence

- BE focused tests: 19 passed; changed-file lint passed.
- WEB focused tests: 7 passed; changed-file lint passed.
- Actual isolated Firestore integration: 7 passed, including inbox retention when
  push is off, duplicate writer suppression, unrelated preferences, digest
  cancellation and merge fence. FCM was a process stub; SMTP was a spy.
- Active immutable snapshot source `c6990987c9ad`, artifact `17883b274ee2`:
  5029 public/social/background checks 9 passed; 5039 preferences HTTP checks 5
  passed. Snapshot has no scheduler exports and zero checkout compiled imports.
- Actual browser390px, app5174 / HTTP5039: 4 passed (master and comment readback,
  digest persistence after reload, offline failure preserving confirmed state and
  reconnect retry). Zero page errors. Only synthetic ui-viewer preference fields
  changed, then restored. No external email or FCM sent.
- Whole WEB typecheck during parallel work was not green: in-progress
  useGroupRideActivities/activityDiscovery integration and ActivityPage nullable
  access were reported to their owners. It is not represented as a successful gate.

Artifacts are under
`/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r3-settings/`:
`server-check.mjs`, `server-results.json`, `browser.mjs`,
`browser-results.json`, and `settings-mobile.png`.
The initial test selected the intentionally hidden native switch input as visible;
`browser-selector-failure.json` preserves that harness failure. Final verification
clicks the visible switch label, with no response mocks.
Snapshot preparation, preflight, activation/rollback and HTTP evidence are under
`full-stack/runtime-snapshots/` (`PLAN.md`, `activation.json`,
`preflight-prefs.json`, `verification-prefs-5029.json`, `prefs-http-results.json`).

App settings consumption, actual device push delivery, scheduled SMTP delivery,
production token verification and deployment are outside this local evidence.
