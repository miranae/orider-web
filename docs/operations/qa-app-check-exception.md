# Existing QA App Check exception

Operator-approved permanent scope (2026-10-25): the twelve existing Firebase Auth UIDs `qa_beta_m4_20261024_a` through `qa_beta_m4_20261024_l`, enumerated as exact literals in code. This is not an email/prefix match, custom claim, client flag, new credential or IAM grant. The earlier proposed two-hour exception was never activated and is superseded; there is no expiry job to remove.

## Boundaries

Project: `miranae-orider-g1`. Web: `https://orider.co.kr`. Callable region: `asia-northeast3`.

The web skips its explicit App Check readiness gate only for a non-anonymous current Firebase Auth user in this exact set and project. This alone grants no server authorization. The server uses the callable SDK-verified Auth context, checks decoded UID/sub consistency for the QA exception, and never accepts UID/email/QA flags supplied in request data or headers.

Exactly five callables replace unconditional SDK `enforceAppCheck:true` with `enforceAppCheck:false` plus the server guard: `claimEventRideSessionV1`, `finishEventRideSessionV1`, `releaseEventLocationLease`, `reserveRawActivityPartUpload`, `finalizeActivityParts`. Other authenticated callers still need SDK-verified `request.app`. Auth remains required for everyone. The existing account-deletion fence runs before the guarded handler. Membership/manager checks, Firestore/Storage Rules, session claim identity/version, ownership and all existing quotas remain in place.

The existing console services (Auth, Firestore, Storage, Realtime Database and OAuth) were already UNENFORCED; this change does not alter those settings. Club/meeting callables without existing App Check enforcement remain unchanged. It does not fix the underlying ordinary-user reCAPTCHA attestation rejection.

## Operational use and risk

Use only the approved QA accounts and isolated test club/materials. Do not notify real members, publish real activities or use actual locations/health data. Credentials remain in the approved nonsync M4 Keychain and are never committed or logged. A stolen QA credential can exercise its account's allowed operations without attestation indefinitely until revoked; quotas and authorization still apply. Adding identities or broadening scope requires a separate explicit decision.

QA-exception production functional acceptance, normal-user App Check acceptance, emulator/bridge tests and real GPS/BLE/store binaries are separate results. Do not mark a complete user journey from a successful deployment, SDK login or unit-test count.

## Disable / rollback

Remove the selected UID from both exact sets to revoke it, or remove the web exception and restore `enforceAppCheck:true` on all five callables to revoke the whole exception. Use the existing reviewed PR/CI/verified-release/explicit-target deployment procedures; do not change branch protection, Rules, IAM or secret stores. Verify deployed source IDs/flags and the live web bundle after restore. Tests must continue to reject forged-body UID, mismatched decoded UID, missing Auth, anonymous QA, non-QA without App Check and deleting/nonmember business operations.

Pre-change evidence on M4: server run40190427754 / `9b03e378c22efeb8107aa8144b27425b4a1d1de6`; web run40203015004 / `fb8acf626a79b51444acac05b38c349e6933360c` (production deploy successful 2026-10-25T14:39:33Z). The earlier Hosting release `1792934129522000`, version `07917d7ecd31bbfd` belongs to the superseded 91552444 baseline; it is not the current rollback target. Recheck actual live versions before any rollback; preserve later unrelated changes.
