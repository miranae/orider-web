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

The browser demo uses actual source components and Firebase SDK calls against synthetic data in `demo-orider-epic-2882-full`. The final dedicated stack runs Functions port 5029, Firestore port 8398 and Auth port 9309, including actual background aggregation and native feed projection triggers. Earlier narrow-transport artifacts remain for traceability. No real athlete data is required. The demo shell is separate from the deployed application; it is not a full application routing/deployment validation.

The training-only local switch requires a development bundle, loopback page, explicit emulator configuration, a demo project, an exact loopback customDomain and matching Firebase app identity. A Functions emulatorOrigin override is rejected because the SDK would ignore customDomain. No stage-derived options or running analysis are enabled by this local switch.

## Evidence boundaries

Actual HTTP smoke checks exercise callable middleware and Firestore with emulator tokens. They do not prove production App Check signature verification. Browser screenshots use synthetic assets. Local latency is not production performance evidence. Historical PMC migration, real-account rollout, beta recruitment and mobile delivery are outside these local checks.

Before any future remote release, inspect the combined diffs and follow repository deployment/review gates. There is deliberately no automatic remote delivery step in this local handoff.

## Final local validation

- Web: 877 Vitest files / 9,376 tests passed; contract suites passed. Node 22 development build, lint and quality budgets passed.
- Backend integration: 555 targeted tests passed / 14 opt-in emulator cases skipped in that run; build/lint/index-policy passed. A separate linked-source Firestore regression ran both cases successfully.
- Actual callable HTTP smoke: 9/9 passed on the dedicated stack, including automatic kudos/comment count aggregation; period endpoints confirmed 124.8 km versus 50 km and 5-minute measured power 280 W versus 260 W using synthetic data.
- Actual browser Firebase SDK: public detail, kudos, comments/pagination, gallery, memo and both period endpoints returned 200 without page errors. Mobile and desktop screenshots are in the external demo artifact directory.
- Local preview: http://127.0.0.1:5222/ and http://127.0.0.1:5222/?periods=1 . Refer to the external `public-ui/README.md` for startup commands and the local image-certificate requirement.

The original activity date label now states KST to match the displayed date; the diagnostic snapshot timestamp continues to state UTC. The two period panels disclose their distinct candidate populations. See the server's `docs/analysis/period-linked-source-populations.md` for the linked-copy regression contract.

Dedicated stack startup and evidence: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/full-stack/README.md`. Existing shared emulator services were not restarted or reconfigured.

Final follow-up fixes: confirmed reactions no longer revert to pre-write counts while background aggregation catches up (bounded permission-checked readback); access revocation invalidates pending readbacks. Memo/comment controls restore keyboard focus. The final 9,376-test run and development build include these fixes.
