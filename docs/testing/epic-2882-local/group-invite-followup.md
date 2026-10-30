# Group comparison and friend invite local follow-up

Local only; no remote write, deployment, real invitation delivery, or paid model request. Current strict emulator rules retained. App compatibility remains deferred.

## Group comparison

Actual Chrome mobile viewport 390×844, full-app 5174, HTTP 5039, Firestore 8398: 4/4 checks passed. Safe discovery returned two temporary synthetic activities; the non-owner native stream raw read was denied and REST fallback returned 11 samples. Rider selection hid/restored a record; original activity navigation and owner anchored co-rider discovery succeeded. Both raw activity queries observed were legitimate personal `userId == ui-viewer` queries, not shared group queries. No non-owner raw activity query was observed.

Artifacts: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r1-group-browser/{check.mjs,results.json,group-mobile.png,original-detail.png}`. Temporary activities/streams were removed; existing review fixtures preserved. The first overly broad zero-raw-query assertion failed and is preserved in `results-first-query-audit.json`. The synthetic stream intentionally has no GPS; this is not a route-map validation. This earlier run recorded missing narrative callable CORS and a logging rate warning, not a clean-console claim.

## Friend invitation

The previous public-profile query by friendCode cannot work with current profile rules/projection. The page now uses `resolveFriendInvite` and current safe activity discovery. Anonymous SDK users preview rather than invoke the mutation. Exact User identity scopes state; hidden pages clear it; focus and 30-second refresh recheck policy. A request timeout is not instant revocation. Signed-in existing invitation action is preserved.

WEB product commits: 55acd692 and the nickname contract boundary follow-up. Focused tests cover anonymous preview, current privacy removal, same-UID identity replacement, signed-in action, invalid input/response and 200/201-character nickname boundary. Latest focused result: 10 tests; TypeScript checked separately. Parent full regression/build ran at the preceding source boundary; these focused tests are not summed into that full-suite count.

Final immutable server source `d95c55910ff34eec588d66ff199348c9b37871ddb3dc65942f9b88120b0d346b`, artifact `30e8d8c2cd136b7278819001e625c1b22772b2d1fe60771467a73afdaa97c566`. Wrapper exports include resolveFriendInvite, hardened existing addFriendByCode, and existing getActivityNarrative. Local inert provider-key placeholders prevent secret-manager lookup; no generation request was made. Snapshot dependencies and checkout-import absence passed preflight; prior wrapper retained for rollback.

Actual final Chrome/SDK checks: 3/3 passed. Anonymous resolver returned 200 and displayed the synthetic inviter; changing profilePublic to false then focus removed that content after a second 200/null result. Owner ui-raw-native-ride automatically requested narrative with `cacheOnly:true`, returned 200/hit:false, and produced no page errors. No response mocking, real email/FCM, or model generation. The synthetic users document was deleted afterward. No actual signed-in friend mutation was sent in this browser check; server actual-Firestore mutation tests are separate evidence.

Artifacts: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r1-friend-browser/{check.mjs,results.json,anonymous-preview.png,owner-detail.png}`. Runtime manifests/rollback are under sibling `full-stack/runtime-snapshots/`. No whole-epic, app, production or beta-completion claim follows from these local checks.
