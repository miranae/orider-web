# R8 first-card transfer budget audit (read-only)

Source checkpoint: WEB75f12709, product fe9a97e5. Evidence is the existing E30 sample and built artifact from `r8-sanitizer-chunk-split`, not a new measurement. No runtime, build, test, shared-service operation, original-data change, backfill or deployment was performed for this audit. The unbuilt namespace registration draft was discarded completely; product source remains unchanged.

## What the current cold synthetic path requires

| Initial JS dependency | gzip bytes (Node22 default compression) |
|---|---:|
| Entry, including both-language inline resources |337880|
| Shared vendor (React/router/i18n and dependencies) |202535|
| Firebase vendor |183247|
| Total static JS |723662|

The existing30 samples each completed before first-card readiness: median script encoded814050B (includes response headers and later route chunks), CSS29653B, HTML486B, Fetch5350B, XHR403B. The sums of per-type medians are approximate, not a packet trace; response headers and gzip payload totals must not be equated. Fonts/media are not established as required by these text-only fixtures. Zero image encoded bytes before readiness does not mean no eventual image requests.

Median timeline: document→initialJS requests168ms; entry response ends4095.91ms; Dashboard and its41 other JS dependencies start around4149–4152ms and final JS ends5559.73ms; discovery starts5574.98ms/duration194.67ms; subsequent render25.22ms. The sample p50 is5789.3ms/p955812.9ms. Quantiles of separate timing fields are not one exact trial. `analysis.json` retains per-path medians. Network duration includes configured150ms latency and HTTP1 scheduling; it is not serverCPU. JS response end is not total execution time.

Actual source path: `src/main.tsx` loads runtime configuration/initializes Firebase before render; `src/AppRoot.tsx`→AuthProvider→`src/App.tsx`→`src/components/Layout.tsx` lazy Dashboard→`src/pages/DashboardPage.tsx`/MobileFeedPage→useActivities/discovery→first real card. The external product-shaped demo bootstraps synthetic Auth and reuses actual AppRoot/build configuration; it does not prove the entire production bootstrap, attestation or cold sign-in path. Auth IndexedDB is retained; cache-disabled fresh browser contexts with a warm emulator are not server-process cold starts.

## The2second target remains unmet

At200000B/s,2seconds permits at most400000B for all transferred data with zero network/CPU latency. Current initialJS alone requires3.61831seconds and exceeds that budget by323662B (44.7% of current initialJS). The observed pre-ready script+CSS+other medians total about849942B, requiring about4.25seconds even before latency/CPU if those bytes share the configured aggregate throughput. This arithmetic is an optimistic bandwidth bound, not a predictive hosted benchmark.

Even dropping the entire entry unrealistically leaves shared+Firebase385782B, consuming1.929seconds before document/route/discovery latency. No approved small namespace split can establish2second compliance. HTTP2 multiplexing can reduce scheduling/round-trip overhead but cannot remove a fixed byte-transfer bound at unchanged throughput. Brotli, CDN, cache, compression level, real request priority and production payload sizes have not been measured here.

Do not silently relax the goal. Proposed acceptance review: preserve the existing synthetic HTTP1/cache-disabled150ms/200KBps lane as a stress result, and separately define/measure real hostedHTTP2/compression, cold vs warm cache, authenticated vs first sign-in, deviceCPU, first-card event and complete/censored request denominators. Any change to the actual2second acceptance network/cache conditions requires user approval. No hosted measurement or approval occurred in this task.

## Largest bounded next candidate, deferred

`src/i18n/index.ts` eagerly includes11 namespaces in both Korean and English. Existing module graph attributes757898 rendered code units to those locale modules (not gzip/UTF8 bytes). Independent compact JSON gzip sums281126B; these are **non-additive estimates**, not removable compiled bytes. `activity` and `fitness` are real card consumers; removing them wholesale would break existing first-screen labels. Auth/common/dashboard and glossary also remain required.

Five less-immediate namespaces have combined sourceJSON gzip83301B: settings32085B, training33198B, coach15216B, migration2482B, lab1975B individually. Their independent totals differ from jointly compressed bytes. Actual compiled saving is unknown because no candidate build was executed. Both-language bundles must remain available for language switching once their consumer loads; reintroducing separate i18next JSON waterfalls is not acceptable.

Audit found84 source consumers (settings28/training48/coach6/migration1/lab1), some repeated hooks giving145+call sites. Intersection with modules requested by the existing mobile first-feed sample is0. Desktop HomeTodayStrip DOES use training, but inside its existing deferred boundary; desktop semantics cannot be inferred from mobile-only observations. Direct namespace-prefix use in MobileLogPage and training constants plus embedded PlanSurface must not be missed.

The safe future pattern is the existing legalResources approach: resource registration travels with the consuming lazy module before useTranslation, remains idempotent, preserves preexisting bundles and both languages, and never triggers automatic analysis changes. However, mechanically wiring84 consumers is too broad for this iteration. No namespace product change was retained. Future work should choose a smaller demonstrably closed namespace boundary, validate all direct/embedded imports, offline language switching/direct navigation/retry and desktop TodayStrip, then inspect exact artifact/request graph before A/B. Even all five estimated83KB would not solve the current2second byte deficit.

Firebase vendor contains Auth/Firestore/AppCheck/Storage/functions initialization; re2js is a Firestore dependency, not an unused utility. Deferring security, weakening ACL/AppCheck, replacing stored analyses, or serving an incomplete first card is not an acceptable performance shortcut. No such changes are proposed.

## Evidence and limits

`analysis.json` and `analyze.cjs` bind numerical analysis to existing30 trials; `consumers.json` is the source consumer map. Existing `r8-sanitizer-chunk-split/{comparison.json,artifact-binding.json,E-results.json}` contains the original complete request records:30/30 ready,2040responses with HTTPerrors0/requestfailed0/pageerrors0,Listen30 censored,20original document hashes unchanged. These are historical observed results, not a new zero-error run. Product75f12709 is unchanged and its prior fe9a97e5 full10178PASS remains the last executed gate.

External evidence: `/Users/kyoungnam/Documents/Codex/2026-10-29/r8-initial-budget-audit`.
