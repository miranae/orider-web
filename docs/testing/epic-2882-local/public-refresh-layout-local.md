# Public detail periodic revalidation layout

## Scope

Product baseline `182c8124`; local correction `eeeaa027`. Existing common ActivityPage, ACL cadence, named SDK identity and saved-analysis behavior are retained. No remote push/deployment or source-data recomputation.

## Reproduction and correction

A 35-second read-only named-owner browser observation reproduced the periodic revalidation collapsing the whole detail: document height 2935→736px and scrollY 1000→16px. When the response arrived 92ms later, height recovered but scroll remained at 16px.

The corrected boundary preserves the last authorized height during verification while hiding the subtree visually and from accessibility, keyboard and pointer input. The existing model still strips map geometry until verified. Actual access denial/session replacement removes the boundary entirely.

Under identical conditions the 89ms verification interval retained height2935px and scrollY1000px. HTTP errors0, page errors0, new analysis/AI generation0; all12 protected document hashes unchanged. The owned5449 harness was stopped; shared services were preserved.

Focused public-access/public-surface regressions36/36 PASS; types/scoped lint PASS. Whole-repository gate at exact product eeeaa027: 958 suites / 10188 tests PASS; contracts, lint/quality budgets and build:dev all exit0 (Node22, workers2). The only end-of-gate untracked file was this evidence document; product HEAD was unchanged.

## Evidence and limits

External evidence: `/Users/kyoungnam/Documents/Codex/2026-10-29/public-refresh-layout/README.md`, `harness/before-scroll.json`, `harness/after-scroll.json`, `full-gate/results.json`.

This confirms the browser scroll regression, not the cause or resolution of native iOS click synthesis. The existing short content shield remains. The external fixture has incomplete Tailwind scanning and does not constitute visual-design acceptance. Physical-device/production behavior is unverified.
