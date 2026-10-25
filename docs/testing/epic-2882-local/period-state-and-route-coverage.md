# R6 comparison controls and R5 native route coverage

Local implementation only; no rollout, remote write or production claim.

## R6 restored UI controls

Power periods preserve draft dates, manual comparison preset, W/Wkg, skills mode and representative duration. Training periods preserve preset and two date ranges per discipline. Only these UI controls enter tab-local sessionStorage. Responses, source activity IDs, power values, profile weight/FTP and credentials are never persisted.

The namespace follows the existing power-effort hint policy: SHA-256 of Firebase project/app, owner UID and account creation time. Missing identity metadata, unsupported crypto or denied storage disables persistence without blocking analysis. Corrupt, oversized, unknown-field, future/invalid/reversed date or out-of-range duration data is not restored. A different account/project cannot read another scope's hints.

Returning from an activity or reloading the same browser tab restores valid inputs. Results require explicit Load again and go through normal authenticated server checks. A fresh tab or direct URL without matching session hints starts with defaults. URLs contain no owner IDs, result data or serialized comparison state; this is not a shareable comparison-link feature. Browser/session destruction removes these hints according to browser storage behavior.

## R5 missing native completeness contract

The local observed-native demo proves grouping of two recorded GPS tracks only. Native raw_parts route evidence intentionally retains coverage=unknown. A finalized GPS file and contiguous observed samples do not prove collection of the full ride. All observed-native group members therefore remain excluded from ranking, and fastestActivityIds stays empty. The existing complete-path ranking UI must not be enabled by relabeling unknown coverage.

A follow-up producer design must establish these witnesses before eligibility can change:

1. Define the recording session's trusted start/end, pause semantics and GPS sequence/sample manifest. Distinguish no GPS expected during an explicit pause from sensor loss, permission loss, app termination or partial upload.
2. Bind coverage evidence to activity incarnation/content revision, exact raw GPS object generations/digests, source schema and producer version. Store independently auditable counts/boundaries and gap classifications; completion of upload alone is insufficient.
3. Derive complete/partial/unknown from validated evidence. Missing legacy manifests remain unknown. Do not backfill complete status by guessing from duration, first/last coordinates or matching another track.
4. Include witness revisions in route input revisions, index descriptors and cursor snapshot checks. Source edits, deletion, archive migration or superseded GPS invalidate old eligibility before comparison; retain owner ACL and existing transaction fences.
5. Locally verify actual reserve/finalize/compute/index producers on multi-year repeated routes, reversed routes, nearby but different roads, partial loops, missing first/last samples, pauses, interior gaps, duplicated recordings, deletion and in-flight source replacement. Assert personal/annual winners only for eligible evidence, preserving cohort limits and source links.
6. Audit existing data in a bounded read-only dry-run: count recoverable witnesses, unknown legacy records and expected read/download/index costs. Publish no whole-history personal best from the first20/validated6 cohort.

Open product/contract decision: what evidence and maximum gaps justify whole-ride completeness for each recorder schema? Until decided and implemented, observed routes can be explored but cannot satisfy the epic's native personal-best acceptance criterion. Release remains on hold.
