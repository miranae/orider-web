# R6 comparison controls and R5 native route coverage

Local implementation only; no rollout, remote write or production claim.

## R6 restored UI controls

Power periods preserve draft dates, manual comparison preset, W/Wkg, skills mode and representative duration. Training periods preserve preset and two date ranges per discipline. Only these UI controls enter tab-local sessionStorage. Responses, source activity IDs, power values, profile weight/FTP and credentials are never persisted.

The namespace follows the existing power-effort hint policy: SHA-256 of Firebase project/app, owner UID and account creation time. Missing identity metadata, unsupported crypto or denied storage disables persistence without blocking analysis. Corrupt, oversized, unknown-field, future/invalid/reversed date or out-of-range duration data is not restored. A different account/project cannot read another scope's hints.

Returning from an activity or reloading the same browser tab restores valid inputs. Results require explicit Load again and go through normal authenticated server checks. A fresh tab or direct URL without matching session hints starts with defaults. URLs contain no owner IDs, result data or serialized comparison state; this is not a shareable comparison-link feature. Browser/session destruction removes these hints according to browser storage behavior.

## R6 acceptance audit follow-up (2026-10-26)

The current WEB source was compared with the epic's explicit R4/R6 requirements. Existing W/Wkg selection, representative-duration/source links, calculation-profile weight snapshot disclosure, applied FTP history versus monthly estimated FTP, KST presets/custom dates, partial-day load evidence, and account-scoped control restoration were retained. Power maxima may inspect linked/duplicate candidates separately while distance/time statistics use their defined deduplication population; differing counts alone do not establish a defect. This audit does not certify all producer eligibility or whole-history parity.

Two concrete corrections were made locally:

- `dc75cf64`: dense power observations used UTC date truncation below a KST period chart. Period labels and source dates now use the same KST calendar helper, including the detailed source table. The regression covers a January 1 KST midnight range and a January 1 early-morning activity that falls on December 31 UTC. Dense-duration selection now reuses the existing account-scoped period controls, so visiting its source and returning restores the chosen duration after explicit Load. No results or additional sensitive data enter storage.
- `30707203`: period power reads previously compared only the UID around asynchronous work. The service now captures the exact SDK user before App Check readiness and checks it before dispatch and after response. The hook also invalidates its generation on SDK session replacement, including another login with the same UID; previous-session results cannot populate the current selection.

Validation used Node 22. The date/duration run passed 2 suites / 21 tests; the subsequent session run passed 3 suites / 92 tests, including the period-panel suite already present in the earlier run. These counts overlap and must not be summed as distinct tests. Both changes passed TypeScript and scoped ESLint. Logs: `/tmp/r6-period-audit-tests.log`, `/tmp/r6-session-audit-tests.log`, `/tmp/r6-session-tsc.log`, and `/tmp/r6-session-lint.log`. Source navigation/return was exercised with React Router component tests. No new actual-browser or production evidence was collected for these commits; existing synthetic demo evidence remains separately scoped. No backend, remote, rollout, or deployment change was made.

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
