# Epic 2882 local integration

2026-10-26. The user's local-only instruction supersedes the earlier remote delivery workflow. Do not push, merge, deploy, or update remote issues from this checkout.

## Integrated behavior

- Native public activity details, owner memo revision checks, paginated comments, full photo gallery and immediate access-revocation cleanup.
- Native observed routes explicitly retain incomplete/unknown coverage and remain excluded from competitive ranking.
- KST custom dates, complete 28-day comparison and year-to-date controls for training/power analysis.
- Club invitation recovery preserves the original invite through sign-in and retry. Public club crawler previews use public visibility, active/directory flags and deletion checks.

## Local runtime

Web source: `/Users/kyoungnam/work/moon/_worktrees/orider-epic-2882-local-integration-20261026`.
Server source: `/Users/kyoungnam/work/moon/_worktrees/orider-g1-web-epic-2882-local-integration`.
Demo and transport artifacts: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882`.

The browser demo uses actual source components and Firebase SDK calls against synthetic data in `demo-orider-epic-2882-full`. The final dedicated stack runs Functions port 5029, Firestore port 8398 and Auth port 9309, including actual background aggregation and native feed projection triggers. Earlier narrow-transport artifacts remain for traceability. No real athlete data is required. The final `full-app` harness mounts the actual AppRoot, AuthProvider and BrowserRouter and uses the real Firebase SDK. The earlier component-only demo remains for traceability. This verifies local application routing, not deployment or production authentication infrastructure.

The training-only local switch requires a development bundle, loopback page, explicit emulator configuration, a demo project, an exact loopback customDomain and matching Firebase app identity. If Functions has an emulatorOrigin override, its effective origin/project/region URL must match the configured local demo endpoint exactly; a matching customDomain alone never authorizes a different actual destination. No stage-derived options or running analysis are enabled by this local switch.

## Evidence boundaries

Actual HTTP smoke checks exercise callable middleware and Firestore with emulator tokens. They do not prove production App Check signature verification. Browser screenshots use synthetic assets. Local latency is not production performance evidence. Historical PMC migration, real-account rollout, beta recruitment and mobile delivery are outside these local checks.

Before any future remote release, inspect the combined diffs and follow repository deployment/review gates. There is deliberately no automatic remote delivery step in this local handoff.

## Earlier integration validation (before the following additions)

- Web: 877 Vitest files / 9,376 tests passed; contract suites passed. Node 22 development build, lint and quality budgets passed.
- Backend integration: 555 targeted tests passed / 14 opt-in emulator cases skipped in that run; build/lint/index-policy passed. A separate linked-source Firestore regression ran both cases successfully.
- Actual callable HTTP smoke: 9/9 passed on the dedicated stack, including automatic kudos/comment count aggregation; period endpoints confirmed 124.8 km versus 50 km and 5-minute measured power 280 W versus 260 W using synthetic data.
- Actual browser Firebase SDK: public detail, kudos, comments/pagination, gallery, memo and both period endpoints returned 200 without page errors. Mobile and desktop screenshots are in the external demo artifact directory.
- Current full application preview: http://localhost:5174/ko/ . The external `full-app/README.md` documents startup and the dedicated synthetic browser. Earlier component previews remain at port 5222. Port 5224 is not the final preview because the existing REST CORS policy accepts localhost:5174.

The original activity date label now states KST to match the displayed date; the diagnostic snapshot timestamp continues to state UTC. The two period panels disclose their distinct candidate populations. See the server's `docs/analysis/period-linked-source-populations.md` for the linked-copy regression contract.

Dedicated stack startup and evidence: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/full-stack/README.md`. Existing shared emulator services were not restarted or reconfigured.

Final follow-up fixes: confirmed reactions no longer revert to pre-write counts while background aggregation catches up (bounded permission-checked readback); access revocation invalidates pending readbacks. Memo/comment controls restore keyboard focus. The final 9,376-test run and development build include these fixes.


## Additional local verification — 2026-10-26

- A synthetic native activity went through Storage upload reservation/finalization and the real activity metrics writer. Seven sensor axes with 601 samples produced canonical version 41: 6 km, 600 seconds, 10 m ascent and 221.879 W normalized power. The recorded summary intentionally had 12 m ascent. Automatic Cloud Tasks delivery was not exercised; the real writer was invoked directly after upload finalization.
- Actual mobile feed, public detail and owner analysis now agree on canonical 10 m ascent. The mobile card previously used recorded summary 12 m; `withActivityPresentation` now supplies the same presentation contract as the desktop card. The full-app journey used actual callable/REST endpoints, with successful responses and no page errors.
- Raw analysis displays elevation, speed, heart rate, measured power, cadence, zones and the power curve from the synthetic 601 samples. Owner streams succeeded; foreign access was denied. See `full-stack/raw-native-readback-results.json` and `full-app/raw-journey-results.json` in the external artifacts.
- Fixed-dimension journey measurements cover public detail, period analysis and social mutations, including cancellation/error outcomes. They exclude IDs, GPS, health values and user text. Their component timing boundary is distinct from navigation-to-render measurements. See `journey-measurement.md`.
- The local training switch validates the effective Firebase SDK destination, including emulator origin, demo project and region. An unrelated emulator or remote endpoint cannot be enabled by a matching custom-domain string.
- Native route backfill inventory is a bounded, local-only, read-only plan: explicit synthetic owner/activity IDs, no raw-object download or scheduled work, documented cost/failure limits. See server `docs/analysis/native-route-backfill-plan.md`.

The whole epic remains open. App work is deferred, and production deployment, real rider beta, automatic queue delivery, historical production backfill and production performance have not been completed by these local checks. Subsequent segment/shared-preview changes require their own tests and the final combined checks.
