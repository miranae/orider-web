# R5: large recorded-history UI, local-only evidence

## Scope and checkpoints

The previous completed checkpoint (WEB `9727dfa7` / copy `4389cea9`, immutable BE `d3f9cc5effbf`) remains separately preserved. This follow-up is WEB `6a0e554f` and the scoped server rate-policy fix `452e3b7c`.

A user action now sends at most 2,000 sequential requests, with one in flight, returned-version progression and a server-expiry check before each next request. It never automatically retries an error. Stop clears results and recovery information. Navigation/reload retains only an opaque checkpoint, not results.

Session storage contains exactly `runId`, `version`, `expiresAt`. Its hashed key binds the Firebase app/project, owner, login metadata and current source scope. Missing login metadata disables persistence. SDK identity replacement discards checkpoints; initial auth hydration can restore. A restored checkpoint requires an explicit status read before displaying any server result, then explicit continue for unfinished work. An obsolete writer cannot update another scope. An unanswered first start has no acknowledged run ID and cannot be recovered.

Node 22 focused verification: 4 suites / 33 tests, type check, scoped ESLint and diff check passed. Coverage includes 754 sequential responses from one start, the 2,000-request bound, one in flight, expiry, stop, identity changes, opaque persistence, auth hydration, stale writers, status-first recovery and explicit continuation. No new full-suite or production-build claim is made for this follow-up.

## Actual callable discovery and correction

The isolated initial browser run found a real policy mismatch: `enforceRateLimit` first applies the shared local counter in all environments. Without a policy override, the nominal 6,000/hour history policy also inherited 10 requests/10 seconds. Actual SDK calls produced 10 HTTP 200 responses followed by a 429; the screen stopped safely with 18 activities inspected and no best result.

The scoped fix sets history-step's per-owner burst allowance to 200/10 seconds while retaining its 6,000/hour budget and the separate start limit. Other policies remain unchanged. A physical copy of immutable d3 received only `activity-route-history-callable.ts` and `activity-route-history-policy.ts`. Missing build-integrity tooling was added for stamping; no concurrently edited checkout `lib` was copied. Node 22 build passed: source `8cbaa5874d12`, artifact `f6c53a07464d`. Only the isolated Functions port 5059 used this copy; normal review services 5029/5039 retained d3.

## Actual browser results

The namespace `demo-route-history-ui-scale` contained a separate synthetic owner and 1,001 GPX-derived records. Actual GPX parsing and receipt construction populated Firestore/Storage directly; this does **not** claim 1,001 UI uploads. No background triggers were registered for this namespace.

The harness rendered the actual history panel and services with actual Firebase Auth/AppCheck/Functions SDK connections. It was a component integration harness, **not** the complete application's router.

| Scenario | Observed result |
| --- | --- |
| Start once, without intervention | 754 HTTP 200 responses; 62.657 seconds; all 1,001 candidates/eligible groups inspected; last record's 100-second result displayed; no page errors |
| Reload after 35 responses | One aborted request during reload, followed by explicit status and one continue; same run completed; 754 successful HTTP responses; maximum one request in flight; 60.030 seconds; no page errors |
| Recovery storage inspection | Only run ID, version and expiry; no local result, counts, GPS or plain activity IDs |

Both final responses reported `verified_recorded_best` for the stored observations at the query time. Neither establishes physical-ride capture completeness or a current global personal best. No response mocking or artificial network pacing was used. These are two local synthetic samples, not production performance percentiles. Both final screenshots were visually checked.

## Evidence and cleanup

External evidence directory:
`/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r5-ui-scale-1001/`

- `browser-before-rate-policy-results.json`: preserved 429 failure.
- `browser-one-action-results.json`, `one-action-desktop.png`: one-action completion.
- `browser-results.json`, `complete-desktop.png`: reload/status/continue completion, including the deliberate aborted request.
- `runtime-snapshot-policy-452e3b7c/overlay-provenance.json`: exact two-file product overlay and build provenance.
- `result.json`, `cleanup.cjs`, `cleanup-results.json`: exact resource allowlist and isolated cleanup evidence.

Cleanup removes only the synthetic owner, its 1,001 activities/streams/objects, private run documents, Auth user and rate buckets. The temporary 5059/5244 services are stopped after verification. Existing review fixtures and services remain unchanged. No remote write, push or deployment occurred.
