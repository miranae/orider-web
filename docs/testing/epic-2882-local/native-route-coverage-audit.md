# Native repeat-route coverage witness audit

2026-10-26. Read-only source audit of the integrated server and current app checkout. No app changes, server verifier, fixture changes, remote writes or deployment were performed. This is source evidence, not a recording-device or production test.

## Conclusion

The existing native upload contract cannot prove whole-recording GPS coverage. Keep native `coverage=unknown`; an upload marked finalized is not a complete-recording witness. The observed-route demonstration can group similar observed geometry, but cannot establish a native personal best or whole-history ranking.

Repositories inspected:

- Server: `/Users/kyoungnam/work/moon/_worktrees/orider-g1-web-epic-2882-local-integration`
- App, read only: `/Users/kyoungnam/work/moon/orider-g1-app`

## What existing evidence proves

| Source | Evidence and limitation |
|---|---|
| Server `functions/src/analysis/activity-route-evidence.ts:129,226–233` | Native CSV rows are parsed with the declared sample count. Time is relative to the first observed GPS sample. Coverage remains unknown intentionally: no first/last recording boundary is established. |
| Server `functions/src/activity-part-finalize.ts:84,398–420` | The request declares activity, axes, parts and optional health binding. Finalization records accepted bytes, samples, hashes and finalize time. This proves submitted objects match the declaration, not that all recording observations were submitted. |
| Same route reader, archive branch around lines 195–214 | Archive locators, byte range, object generation and hashes preserve exact source identity. Archive integrity cannot supply missing capture coverage evidence. |
| App `shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/upload/RawAxisPart.kt:75–106,121–165` | Encoding drops invalid/backward samples and coalesces duplicate timestamps. Sample count describes the resulting CSV. GPS is created from stored TrackPoints; recording boundary/pause/failure metadata is not emitted. |
| App `shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/model/TrackPoint.kt` | Local points can contain ridingTimeMillis, isPaused and recordingCheckpointVersion. These fields do not travel in the current raw-axis finalize contract. |
| App `shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/service/SessionStatePersistor.kt` | Durable FINISHED checkpoint and flush exist for local recovery. They are not server-readable terminal capture evidence. |
| App `android/app/src/main/java/com/miranae/orider/service/RideTrackPointRecorder.kt:95–97,323–330` | Last persisted GPS timestamp and GPS persistence failure count exist locally. A server upload does not include these counters or a loss ledger. |
| App `shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/upload/RawChunkManifest.kt` | Contiguous chunk indices, hashes, byte lengths and submitted sample count describe the submitted manifest. They do not prove capture completeness. No production Android/iOS invocation of this manifest builder was found in this checkout. |
| Android `FirestoreActivityUploader.kt:576–578`; iOS `FirebaseActivityUploader.swift:307–309` | Missing endTime falls back to start plus riding time, which can exclude pauses. Matching raw endpoints against summary dates therefore cannot independently prove capture boundaries. |

Dense samples, equal declared/parsed counts, gap-free observed geometry, matching distance, and a successful upload are useful checks, but none proves missing prefixes/suffixes or omitted intervals never existed. Do not backfill complete coverage from these heuristics.

## Minimum recorder contract still required

1. Versioned session identity and producer semantics, real start/end events, normal versus interrupted termination, monotonic time origin and epoch mapping.
2. A durable sequence ledger covering GPS observations, rejected observations, persistence failures, pauses/resumes, collector interruptions and recovery. The terminal record declares the final sequence and expected counts; an unexplained gap is not complete.
3. Terminal flush acknowledgment bound to the exact final raw bytes, counts and digest. A client boolean `complete: true` alone is insufficient. This remains recorder-provided evidence, not cryptographic proof of physical travel.
4. Binding to owner, activity incarnation/content revision, raw object generations/digests, schema and producer version. Replacements, deletion, archive transitions and delayed older finalization must invalidate or revalidate the witness.
5. Explicit policy for start/end tolerance, GPS acquisition/loss, pauses and sampling cadence. Complete means complete under that declared policy. Missing or unsupported evidence remains unknown; proven omissions become partial.

The existing local checkpoint fields are useful implementation foundations, but require recorder and upload changes. App implementation is deferred; no speculative server verifier is being introduced now.

## Server work that could be validated locally after contract agreement

- Validate the versioned envelope, sequence coverage and final flush binding against actual reserved/finalized objects and the current activity revision.
- Test missing/duplicate/reordered sequence entries, invalid terminal counts, failed flush, interrupted recovery, partial upload, source replacement, deletion, hash mismatch, pause intervals and unknown schema. Legacy activities must remain unknown.
- Bind coverage policy/witness revision into route index and cursor validation. Preserve current ACL, source revision, object generation and mutation fences.
- Exercise real reserve/upload/finalize with synthetic recorder envelopes. Such tests prove server contract handling only; app/device capture correctness still needs separate verification.

## Personal-best scope remains a separate gap

`functions/src/analysis/activity-matched-route-groups-reader.ts` currently reads a bounded descriptor cohort (20 plus lookahead), validates at most six members, and reports `wholeHistory=unknown`. Even a future complete native witness would not make this a whole-history personal best. Complete history indexing, bounded continuation with stable snapshots, duplicate handling and source invalidation need an explicit design. Until then retain observed-only wording and ranking exclusion.

See also [period state and coverage design](period-state-and-route-coverage.md) and [acceptance follow-up](acceptance-followup.md).

## R2 same-time ordering read audit

This audit also inspected `src/hooks/useActivities.ts:270–318,356–433,940–1031` and `src/components/mobile/MobileFeedPage.tsx:384–390` in the web checkout.

- Provider source (native versus imported) is not a separate home query: activities share the collection and sort by actual startTime. Per-source snapshot cursors and retained buffers avoid timestamp-only cursor truncation.
- Query sources here mean own/public/friend/following visibility partitions. The merge uses startTime only, breaking ties by source-array order. Search likewise prefers the first source on equal timestamps. The UI search/local merge retains insertion order on ties.
- A concrete consistency gap exists across home and search: home all-scope combines own/public in one query, while authenticated search has own first, then public. For same-time matching activities, a public row preceding an own row in the home query can become own-first in search. Likewise changes in friend/following query partitions can alter equal-time order. There is no shared global `(startTime, document identity)` tie-break contract.
- This does not establish missing or duplicate rows in a fixed-source pagination run. No runtime/emulator test was run for this read-only audit. The finding is deterministic comparator/source-composition behavior; it is not evidence of a provider-specific timestamp bug.
- If stable ordering across home/search/source partitions is required, agree on a secondary document identity order matching every Firestore query and merge before implementation. Test more than one page of equal-time native/imported/own/public/friend activities, with duplicates and source partition changes. Do not add only a client-side tie comparator while leaving source query ordering incompatible.
