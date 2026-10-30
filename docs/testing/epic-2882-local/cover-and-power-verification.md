# Local representative photos and public power provenance

2026-10-26. Local implementation only; no push, merge, deployment or remote issue update.

## Representative photo

Server `f7ab0176`, web `63f54c51` plus public detail types in `b6f4906c`.

Owners can select or clear a native uploaded cover photo in the photo viewer. The server binds mutations to the current cover revision, checks ownership, photo availability and source/deletion fences, and atomically updates the selection and feed projection. A deleted selection falls back to ordinary photo ordering. Direct client writes to selection/revision metadata are denied. Photo delivery retains authorized bytes and memory Blob URLs; selection never creates a public bearer token.

Focused web tests: 20 passed. Server unit tests: 37 passed; actual Firestore rules: 8 passed; actual Firestore contract: 7 passed. Groups are separate evidence, not a full-suite count.

Actual browser/API evidence: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r2-cover/results.json`. Six checks passed: owner selection/current indicator/clear, selected public photo, matching public detail/gallery/feed projection ordering, and deleted-photo fallback. Three selection calls returned HTTP 200. Temporary uploaded object/document were removed and original cover restored. Profile consumes the same ordered bounded content; its complete browser journey was not separately exercised.

Additional actual concurrency/trigger checks: `full-stack/r2-cover-results.json` passed four checks in a separate synthetic activity. Two simultaneous requests with the same cover revision yielded exactly one HTTP 200 and one HTTP 409 ABORTED. Soft deletion alone triggered the real background photo handler and restored the home projection and detail fallback; no manual projection refresh was used.

## Public power provenance

Server `8c04d91f`, web `b6f4906c` (translations included in `63f54c51`).

Public effective facts expose one bounded classification from the **serving metrics revision**, never active attempts or newer activity metadata:

- `estimated`: serving `isVirtualPower === true`.
- `measured`: serving `isVirtualPower === false` and explicit serving `provenance.power === measured`.
- `unknown`: power exists but the above evidence is missing. `false` alone does not establish a power meter.
- `null`: no permitted numeric average/normalized power. Zero is valid, missing is not zero.

The public screen displays average and normalized power only from canonical facts, with a visible source description. It does not revive recorded power when canonical facts are unavailable, stale or pending. Existing metrics without explicit measured provenance remain unknown; this change does not backfill or certify their source. Threshold context remains private.

Focused server tests: 7 passed, including public/owner, conflicting provenance, zero, absent, pending/stale serving and failed reads. Public-screen suite: 26 passed. Independent read review found no actionable provenance/authorization issue.

Actual 390px browser evidence: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r4-power/results.json`. Unknown, estimated and measured-zero synthetic states returned HTTP 200, displayed the matching label, and had no horizontal overflow or page errors. Screenshots were visually inspected. The measured/estimated states were controlled fixture mutations to test presentation, not proof that a real device recorded them; original metrics were restored afterward.

## Scope

These checks do not establish production performance, production token revocation, native recorder completeness, whole-history personal best, physical-device behavior or paid-Strava parity. See [remaining acceptance](acceptance-followup.md).

## Combined final local gates for this increment

Web product through `1a014fe6`, server `8c04d91f`, Node 22:

- Web 893 files / 9,480 tests passed, followed by all contract suites.
- Web full lint, quality budget and development build passed.
- Server build, full lint and TypeScript compatibility check passed; focused effective-facts tests passed in addition to the photo evidence above.
- Current full-suite logs: `/tmp/orider-2882-cover-power-{all-tests,lint,quality,build}.log`; server logs `/tmp/orider-2882-cover-power-server-{compat,lint}.log` and `/tmp/orider-2882-power-server-build.log`.

No performance claim is made for these changes. Earlier 120-attempt latency evidence belongs to an older source checkpoint.
