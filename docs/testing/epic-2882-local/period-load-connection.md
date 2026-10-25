# R6 selected-period load, PMC and log connection

Local only; no release, remote write or production-data operation.

The existing owner-scoped `useFitnessModel` timeseries is passed to both desktop and mobile period analysis. No second activity scan, new load engine or server contract was added. The panel reads the existing load lifecycle and `describePmcHistory` qualification. It sums only final, finite daily loads, does not fill absent days, does not reseed CTL/ATL/TSB, and rejects mismatched KST boundaries. Load can include saved estimates, so the label is training load, not universally measured TSS.

For complete KST days, the panel shows the selected load total and preceding-day → closing-day PMC, with the existing PMC chart scoped to the selected days. For YTD or a custom end containing a partial day, the full-request total stays unavailable; a separately labeled observation covers the start through the preceding complete KST date. A non-midnight start is unsupported. Missing/unknown/invalidated input and numeric overflow never become zero or a complete total. UTC or timezone-transition histories are not relabeled KST. Snapshot time and the distinct distance/zone population remain visible.

A bounded date input opens the selected day of the training log. The return link preserves the analysis URL and relies on existing account-scoped input persistence; aggregate values are not stored. The mobile return link belongs inside the day-detail overlay, not underneath it. A different owner does not receive the previous owner's return context. Existing timeseries owner-key and late-response fences remain in effect.

## Verification

- Focused tests cover sum/boundaries, YTD complete-day observations, missing/unknown/invalidated load, UTC/transition dates, pending PMC, overflow, day navigation, account-bound return inside the mobile overlay, and existing mobile/fitness/log regressions.
- TypeScript and focused ESLint passed. Parent owns the final combined full-suite/build gate.
- Final browser `results.json`: six checks passed, three actual period callable responses were 200, no page errors, and no horizontal overflow at 390px. Complete 28-day totals, YTD completed-day observation, selected-day log navigation and return, UTC refusal, and unknown-day removal were exercised.
- Actual router/Firebase SDK browser artifacts are in `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r6-load/`.
- Browser setup explicitly replaces the isolated demo owner's timeseries with a complete synthetic lifecycle document and restores the original in `finally`. This proves UI consumption/qualification/navigation, **not the canonical load producer**. The API responses for period distance/zones remain real.
- Early browser evidence found and fixed missing mobile source propagation and a return link obscured by the log overlay. A rapid third period read correctly hit the existing two-requests-per-ten-seconds local limit; `rate-limited-third-read.json` is retained. No rate limit was weakened.
- New local runtime exports the actual `ensureFitnessCurves` and `revalidateTraining` handlers. Earlier wrapper omissions are recorded in pre-fix artifacts; they are not represented as successful API calls.

The selected aggregate is a saved-input snapshot, not proof that all external imports have completed. Non-KST history requires an explicit backend rebucketing contract before it can produce equivalent KST totals. Training sums and power maxima retain their documented populations and scan bounds.

## Subsequent actual producer verification

The manually populated browser lifecycle fixture above remains evidence of UI consumption only. Subsequent backend work `d265c501` / `4978193c` independently executes raw upload/finalization, real metrics, diary and PMC writers against a new isolated synthetic owner. It also fixes fresh explicit-timezone initialization while retaining all existing PMC history. Canonical load13 appears on the same KST day in diary and PMC; the KST period reader returns canonical6000m/600s. See the server `docs/testing/epic-2882-canonical-load/verification.md` and [current integrated checkpoint](local-review-checkpoint.md). This evidence does not retroactively turn the earlier manually populated UI fixture into producer proof or establish production event delivery.
