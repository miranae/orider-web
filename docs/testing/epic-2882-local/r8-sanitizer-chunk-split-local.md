# R8 sanitizer-only chunk experiment

Baseline product HEAD6daefd9e (product85d95ea9), candidate DCO fe9a97e5: vite.config.ts two-line manualChunks addition. No sanitizer code/version/configuration changed. DOMPurify's only consumers are existing lazy CreatePostPage, CreatorHubPage and GPX module; it was previously merged into the initial vendor. re2js was rejected as a candidate because Firestore needs it.

Candidate graph: vendor-sanitize contains one module and has no imports; all three consumers import it, initial index/vendor/Firebase graph does not. Initial Node22 gzip: baseline735387B, candidate723662B (-11725B). Existing4 suites/98 tests passed, including shadow-root template protection, report HTML sanitization, editor paste and GPX unsafe attributes/DOCTYPE rejection. Build passed. No new implementation-shape tests were added.

A30 then E30 fixed-order fresh contexts, same seeded runtime and20 synthetic text activities. HTTP1.1/gzip,390×844,150ms latency,200000B/s down/93750B/s up,cache disabled/auth state retained/backend warm. Actual first-card+enabled reaction+feed_first_content success,2sec observation. No CPU throttle. Results are not production HTTP2 or physical-device claims. Analysis snapshots, original activities and shared services are unchanged. These samples do not replace prior A/D60.

A/E measurement and editor smoke complete. Exact candidate fe9a97e5 full gate:958 suites/10,178 tests PASS,contracts/lint budget/quality budget/build:dev all exit0,Node22.23.4/workers2. Results in full-gate/results.json. No push/deploy/backfill. Dedicated HTTP-only11functions demo wrapper preserves Auth/ACL but locally bypasses AppCheck; no triggers/schedulers. Evidence includes artifact-binding.json, graph-result.json, prepare-results.json and complete per-request A/E-results.json. Long-running Listen is separately censored.

## Results (separate paired sample, not pooled with previous runs)

A30/30 ready, p505849ms/p955858.4ms. E30/30 ready, p505789.3ms/p955812.9ms. The p95 difference is45.5ms, a limited fixed-order synthetic observation, not a production improvement percentage. **The2second target remains unmet.** Both groups:2040requests/2040responses,2010finished/30Listen censored,HTTPerrors0/requestfailed0/pageerrors0. All20 document hashes/updateTimes and seed identity match across both groups. New sanitizer chunk first-feed requests0.

Median A waterfall: lastJSresponse5617.97ms, discovery starts5631.23ms/duration192.44ms, subsequent render22.14ms. E5559.73ms→5574.98ms/duration194.67ms→25.22ms. This is response completion, not total JS execution; discovery duration includes configured network latency. Initial static gzip transfer lower bound remains3.61831s at200000B/s, beforeHTML/CSS/fonts/request latency. No further speculative Firebase splitting or auth weakening.

Actual built CreatePostPage1280: initial feed sanitizer0, entering editor sanitizer1, safe strong/text preserved after paste while script/onerror/javascript URL removed and executionfalse. No publish/creator email/upload actions. Page/HTTPerrors0/externalBlocked0. ExistingUI screenshot `ui/E-editor-sanitized.png` visually inspected. This checks built async loading and real sanitizer/editor path; creator and GPX security behavior additionally covered by existing focused tests. The first consumer now pays one small shared chunk fetch, rather than all feed users paying its bytes initially.

Evidence: `comparison.json`, `A-results.json`, `E-results.json`, `artifact-binding.json`, `sanitizer-smoke-results.json`. Measurement metadata records precommit6daefd9e plus exact candidateDiff/config/artifact hashes;fe9a97e5 commits those two config lines. `graph-result.json` is exploratory Python level9; authoritative byte totals use Node22 gzip default6 in comparison.json and actual Node22 server.

Own9349/8439/5079/5419 services stopped and listener0, browserclosed; APP received heavy slot before finalWEBgate. Immutable local backend snapshot and demo AppCheck bypass remain limitations. No original/saved analysis recalculation; text-only fixture does not establish media/owner-analysis or hosted HTTP2 performance.

External evidence root: `/Users/kyoungnam/Documents/Codex/2026-10-29/r8-sanitizer-chunk-split`.
