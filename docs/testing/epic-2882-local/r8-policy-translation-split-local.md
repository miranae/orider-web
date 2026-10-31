# R8 policy translation split — local evidence

Product candidate: `85d95ea9` (DCO). Baseline product/artifact: `1b130a50`. Final gate on this exact source passed: 958 suites / 10,178 tests, contracts, lint budget, quality budget and build:dev all exit0 (Node22.23.4, two workers). Focused23/23 and TypeScript also passed. No push, deployment, backfill, recalculation or shared-service change.

## Change and contract

The five existing lazy policy pages register the unchanged Korean and English legal resource bundles when their shared module loads. The initial feed retains its other 11 namespaces, layout and data flow. No additional JSON request or automatic analysis generation was introduced. The first policy visit now needs a shared 24.39KB gzip JS dependency; both languages remain available after that load, including offline language navigation. Existing resource bundles are not overwritten.

## Comparable A/D measurements

Same synthetic runtime and 20 activity documents, fixed A30 then D30 order (not randomized). Chromium 145, fresh contexts with restored Auth IndexedDB, cache disabled, warm backend; 390×844, 150ms latency, down 200000B/s, up 93750B/s, no CPU throttle, HTTP/1.1 gzip. Readiness requires the real first article, enabled reaction control and feed_first_content success. Observe two seconds after readiness. These are synthetic local timings, not hosted HTTP/2 or physical-device improvement claims.

| Metric | A | D |
|---|---:|---:|
| First card ready | 30/30 | 30/30 |
| p50 | 5966.7ms | 5849.7ms |
| p95 | 5987.6ms | 5864.5ms |
| Initial static JS gzip | 758924B | 735387B |
| Requests / responses | 2040 / 2040 | 2040 / 2040 |
| Finished / Listen censored | 2010 / 30 | 2010 / 30 |
| HTTP errors / requestfailed / page errors | 0 / 0 / 0 | 0 / 0 / 0 |
| First-feed legal chunk requests | 0 | 0 |

The p95 difference is 123.1ms in this fixed-order sample. **The 2-second target remains unmet.** Removing 23537 gzip bytes has a direct artifact explanation; timing variability and HTTP/1 conditions prevent a production causal percentage claim. Every original synthetic document hash/updateTime remained unchanged. Long-running Listen requests are censored, so observed error zero is not a fully completed-network denominator.

Median waterfall: A JS response end5738.23ms → discovery start5751.60ms, duration193.67ms → render22.15ms. D5618.73ms →5631.90ms, duration191.23ms → render24.25ms. JS response end is not complete execution time; discovery includes synthetic network latency. D initial static gzip alone requires about3.677s at200000B/s before HTML/CSS/fonts/dependency latency. Further savings would require objective separation of remaining initial vendor/Firebase dependencies; auth/AppCheck cannot be bypassed and no additional speculative patch was made.

## Actual existing policy routes

`policy-smoke-results.json`: feed makes no legal request; Korean terms loads the legal JS with zero legal JSON requests; offline English terms navigation succeeds; Korean privacy1280 and English privacy390 headings render. Page/HTTP errors zero. Three external requests were intentionally blocked by loopback-only routing (their domains were not retained), recorded separately rather than silently counted as clean requests. Screenshots are under `ui/D-*.png`; English offline terms and390px English privacy were visually inspected. No deletion action was invoked.

## Evidence and limitations

- `artifact-binding.json`: all artifact/source bindings. D measurement metadata still reports precommit1b130a50 plus dirty source binding;85d95ea9 commits exactly that candidate.
- `comparison.json`, `A-results.json`, `D-results.json`: separate from all earlier90/30 samples.
- `focused.log`, `types.log`, `build.log`; `full-gate/results.json` binds the final all-green checkpoint to85d95ea9.
- `policy-smoke-results.json` and policy PNGs.
- Dedicated9349/8439/5079/5419 listeners stopped after measurement. Shared services and user browser tabs unchanged.

Backend uses the preserved local ccb53376 snapshot, HTTP/callables only and local wrapper AppCheck bypass; this is not production attestation or latest server validation. Fixtures are text-only; media/owner-analysis slow performance and hosted HTTP/2 remain unverified. No saved metrics/AI exist in these measurement fixtures, and no original data was recomputed.

External evidence root: `/Users/kyoungnam/Documents/Codex/2026-10-29/r8-legal-route-split`.
