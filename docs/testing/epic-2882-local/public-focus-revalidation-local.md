# Public detail focus revalidation

Product DCO:9774331384cd0db758a19675eb73015b2be7e4f4. Local-only; no push/deployment/backfill.

## Observation

The previous layout correction eeeaa027 preserved scroll, but actual WK focusing still applied the whole-detail inert/visibility shield for119ms during a tap. The no-touch-script run retained stable offset1010/pan0 yet did not produce a reaction. This was a separate issue from the fixed height collapse.

## Bounded behavior

Focus still starts the same ACL request immediately. Only already visible content in the exact same SDK/session, successfully verified less than30s ago, remains interactive until that response. Retention is capped at min(10s, remaining30s verification lifetime). This is an explicit pending-response display window. It never unmasks previously hidden content. Periodic checks/backgrounding/visibility return/old or backwards-clock verification still mask immediately. Error/timeout masks; denied/deleted/changed-account access removes content. Current stored analyses and opt-in generation policy are unchanged.

## Verification

- Focused42/42; types/scoped lint PASS.
- Exact product full gate:958 suites/10194 tests PASS, contracts/lint/quality/build:dev exit0, Node22/workers2. Start/end HEAD identical and clean.
- Actual native13776:1/1 PASS. One real coordinate tap, no touch WKUserScript, focus≈1429ms twice with shield changes0, offset1010/pan0 stable, final enabled/pressed-on and backend reaction confirmed, native-home return. Normal API cleanup restored baseline. The first≈1s readout was still pending and is not the final result. Raw click was unmeasured; do not claim a click count.

External evidence: `/Users/kyoungnam/Documents/Codex/2026-10-29/public-focus-revalidation/README.md`, `full-gate/results.json`; actual `/Users/kyoungnam/Documents/Codex/2026-10-29/app-native-pan-diagnostic/web-97743313-focus/{native-dom-touch.json,journey-result.json,cleanup-result.json}`.

Prior failures remain preserved. This single local simulator comparison supports the focus-shield regression diagnosis; it does not establish physical-device/production reliability or performance. No synthetic JS.click/touchend-to-click workaround or ACL bypass was added.
