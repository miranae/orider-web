# Linear release synchronization

A production squash is synchronized by applying its exact parent-to-commit delta to current origin/dev. The helper creates a single-parent, DCO-signed topic commit and a draft dev PR. It never directly pushes dev or changes protection/check/review policy.

After main merges, release completion stops with status 3 while a backport PR is pending. Review and merge that PR through scripts/merge-pr.sh, then run `node scripts/sync-main-to-dev.mjs <exact-production-squash-sha>`. Do not rerun the already merged main PR. Only after synchronization returns success should the official tag/deployment proceed.

Already present deltas (including ordinary promotions) need no backport. This checks content, not main ancestry; protected squash histories intentionally stay linear. A conflicting delta stops without changing dev. Concurrent advances remain in the dev-target PR and are subject to the normal merge gate. Retrying reuses the deterministic sync/main-SHA topic PR; a failed or closed PR is not silently replaced. No force push, administrator override, branch protection edit or required-check bypass is supported.

Run `node --test scripts/sync-main-to-dev.test.mjs` and `bash scripts/test-dev-pr-flow.sh` before release-tool changes.
