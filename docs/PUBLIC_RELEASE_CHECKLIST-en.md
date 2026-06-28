# Public Release Checklist

This repository is still private while the final visibility review is in progress. The historical repository was replaced by a clean production-source repository so old private commits and hidden PR snapshots do not carry into the public release candidate.

## Current Status

| Gate | Status | Notes |
|---|---|---|
| Product README | Needs update | README leads with the product, live app, contribution areas, backend boundary, and production-source model. Verified current-product screenshots still need to be regenerated. |
| Live demo link | Done | README and GitHub homepage point to `https://orider.co.kr`. |
| Screenshots | Blocked | README screenshots were removed because the previous images were static demo illustrations, not verified current-product captures. Regenerate real app screenshots with demo-safe data before public release. |
| Contributor path | Done | README, CONTRIBUTING, and DEVELOPMENT describe first contribution areas and local limits. |
| GitHub metadata | Done | Description, website, and topics are set for cycling, fitness, React, Vite, Firebase, TypeScript, open source, and sports analytics. |
| Backend security gates | Blocked | Public visibility depends on backend authz/rules/functions fixes and live verification, not only frontend source cleanup. Track H-2/H-3/H-4/H-1 in the private backend repository. |
| H-2 PII exposure | Needs backend verification | Backend root `users/{uid}` read closure, sensitive-field migration/scrub, rules enforcement, and live verification must be complete before public visibility. See `miranae/orider-g1-web#743`. |
| H-5 webhook secret history | Done | Token rotated, deployed secrets updated, tracked env removed, and the production-source repository was recreated from a clean working tree instead of mirror-pushing old history. |
| Security re-audit | Done | Frontend public-surface re-audit completed in `docs/SECURITY_REAUDIT_2026-06-28.md` and refreshed after clean repository cutover. |
| API/integration clarity | Done | `docs/API_AND_INTEGRATIONS.md` explains public browser config, private backend boundaries, App Check, rate limits, and local development limits. |
| Creator/API product loop | Done | Creator Hub, flagship recipes, owner-only API docs, and email-to-self delivery are documented; production E2E verified callable delivery and quota logging on 2026-06-28. |
| Segment/challenge client estimates | Done | `segmentPrediction` and `challengeFeed` remain public as reusable client-side estimates, not authoritative server analysis. See `miranae/orider-web#27`. |
| Public visibility switch | Blocked | Do not flip visibility until backend H-2/H-3/H-4/H-1 gates, screenshot verification, and frontend documentation/product gates are verified. |

## Backend Security Gates

Frontend cleanup is necessary but not sufficient for public visibility. The browser client exposes paths, callable names, and UI flows, so authorization and privacy guarantees must be enforced by the private backend, Firestore rules, Storage rules, and deployed Cloud Functions.

Blocking backend gates:

- H-2 root users PII read closure: `miranae/orider-g1-web#743`.
- H-3 OG thumbnail privacy gate: `miranae/orider-g1-web#744`.
- H-4 privacy toggle enforcement: `miranae/orider-g1-web#745`.
- H-1 `logClientError` hardening: `miranae/orider-g1-web#746`.

The frontend repository must stay in "preparing for public release" status until those backend gates are live-verified.

## H-2: User Root PII Exposure

Goal: public frontend code must not rely on security-through-obscurity for Firestore paths. Root `users/{uid}` documents must not expose sensitive fields such as email, FCM tokens, body metrics, or private profile data to broad authenticated reads.

Required backend verification before public visibility:

- Dual-write/read migration for private profile fields.
- Production backfill into owner-only private subdocuments.
- Root sensitive-field scrub.
- Firestore rules tightened and emulator-loaded.
- Live production verification proves root sensitive fields are not broadly readable.

## H-5: Strava Webhook Verify Token Exposure

Goal: exposed tokens in git history or local env files must be invalidated before the repo becomes public.

Completed:

- Rotate the Strava webhook verify token in Strava/app backend configuration.
- Update deployed backend secrets.
- Confirm `.env` and local backup files are not committed or published.
- Purge or rewrite repository heads/tags containing the exposed token.

Final state:

- The old history-bearing repository was renamed and kept private.
- The production-source repository was recreated from a clean working tree export, not mirror-pushed.
- The clean repository starts at the public frontend release candidate commit and avoids old commits, PR refs, release refs, and deleted refs.
- Before changing visibility, re-check remote refs from a fresh clone and confirm the old token is absent from advertised history.

## Creator/API Release Gate

Goal: the public repository should be attractive enough to explain why developers and riders would use it, while staying honest about private backend boundaries.

Completed:

- Creator Hub route exists in the product.
- Five flagship personal-data recipes are documented and rendered from metadata.
- Personal Data API documentation describes live owner-only key issuance and read endpoints.
- Representative recipes support explicit email-to-self delivery.
- Production E2E verified authenticated Creator Hub email delivery through App Check, callable function success, UI success state, Firestore sent-log creation, and per-rider quota decrement.

Still intentionally limited:

- Recurring email digests and alerts require separate opt-in, unsubscribe, frequency controls, and abuse monitoring.
- Broad third-party app registration, OAuth consent for external apps, and webhook subscriptions are not public offerings yet.
- Firebase callable names remain internal product contracts unless documented under the Personal Data API.

## Segment Prediction and Challenge Feed Decision

Decision for `miranae/orider-web#27`: keep `shared/training/segmentPrediction.ts` and `shared/training/challengeFeed.ts` in the public frontend repository.

Rationale:

- The logic already ships in browser bundles and is not a true secret.
- Inputs are client-visible rider/segment estimates, not privileged backend data.
- The functions are useful, testable examples of sports analytics logic for contributors.
- Authoritative security, privacy, ranking, abuse control, and private-data access remain backend responsibilities.

Constraints:

- Treat these modules as client-side estimates only.
- Keep tests with the modules so behavior remains reviewable.
- Do not move private backend scoring, provider secrets, or privileged aggregation logic into this repository.

## Presentation Before Opening

- Confirm `README.md` does not overpromise self-hosting without the private backend.
- Create labels for `good first issue`, `accessibility`, `i18n`, `docs`, `frontend`, `security`.
- Seed 5-10 scoped issues that are safe for external contributors.

Completed presentation prep:

- Added README live app link. Removed unverified static demo screenshots; current-product screenshots still need to be regenerated with demo-safe data.
- Added GitHub labels for frontend, docs, i18n, accessibility, security, mobile, charts, maps, testing, and public release work.
- Seeded 7 safe starter issues for copy, accessibility, mobile layout, charts, maps, docs, and E2E coverage.

## Final Public Switch

- Backend H-2/H-3/H-4/H-1 closed and live-verified.
- H-5 hidden PR refs avoided by clean repository recreation, then verified against the final repository surface.
- Security re-audit clean on the final clean repository.
- Current-product screenshots regenerated and verified.
- Public API and integration docs still accurate after final repo recreation.
- Creator/API docs still match the deployed product after final repo recreation.
- Branch protection and `production` environment protection enabled.
- Repository visibility changed to public.
