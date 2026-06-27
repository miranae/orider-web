# Public Release Checklist

This repository is still private. Public release is blocked until the security and presentation gates below are closed.

## Current Status

| Gate | Status | Notes |
|---|---|---|
| Product README | Done | README leads with the product, live app, screenshots, contribution areas, backend boundary, and production-source model. |
| Live demo link | Done | README and GitHub homepage point to `https://orider.co.kr`. |
| Screenshots | Done | Demo-safe dashboard, activity analysis, fitness, and group event screenshots are committed under `docs/screenshots/`. |
| Contributor path | Done | README, CONTRIBUTING, and DEVELOPMENT describe first contribution areas and local limits. |
| GitHub metadata | Done | Description, website, and topics are set for cycling, fitness, React, Vite, Firebase, TypeScript, open source, and sports analytics. |
| H-2 PII exposure | Done | Production backfill and root-field scrub completed; root user sensitive fields verified at 0. |
| H-5 webhook secret history | Partial blocker | Token rotated, deployed secrets updated, tracked env removed, and remote heads/tags purged. GitHub hidden `refs/pull/*` still require Support purge or repository recreation. |
| Security re-audit | Partial | Frontend public-surface re-audit completed in `docs/SECURITY_REAUDIT_2026-06-27.md`. Re-run after creating the clean public repo. |
| API/integration clarity | Done | `docs/API_AND_INTEGRATIONS.md` explains public browser config, private backend boundaries, App Check, rate limits, and local development limits. |
| Creator/API product loop | Done | Creator Hub, flagship recipes, owner-only API docs, and email-to-self delivery are documented; production E2E verified callable delivery and quota logging on 2026-06-28. |
| Public visibility switch | Blocked | Only after all blockers are closed. |

## H-2: User Root PII Exposure

Goal: public frontend code must not rely on security-through-obscurity for Firestore paths. Root `users/{uid}` documents must not expose sensitive fields such as email, FCM tokens, body metrics, or private profile data to broad authenticated reads.

Completed:

- Dual-write/read migration for private profile fields.
- Production backfill into owner-only private subdocuments.
- Root sensitive-field scrub.
- Firestore rules tightened and emulator-loaded.
- Production verification found 0 root sensitive fields.

## H-5: Strava Webhook Verify Token Exposure

Goal: exposed tokens in git history or local env files must be invalidated before the repo becomes public.

Completed:

- Rotate the Strava webhook verify token in Strava/app backend configuration.
- Update deployed backend secrets.
- Confirm `.env` and local backup files are not committed or published.
- Purge or rewrite repository heads/tags containing the exposed token.

Remaining:

- Remove GitHub hidden `refs/pull/*` snapshots through GitHub Support or repository recreation.
- Re-clone and verify the token is absent from all remotely advertised refs, including hidden PR refs.

If repository recreation is chosen, do not mirror-push this repository. Create the public repository from a clean working tree export so old commits, PR refs, release refs, and deleted refs cannot follow it. See [Public Repository Cutover](PUBLIC_REPOSITORY_CUTOVER.md).

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

## Presentation Before Opening

- Confirm `README.md` does not overpromise self-hosting without the private backend.
- Create labels for `good first issue`, `accessibility`, `i18n`, `docs`, `frontend`, `security`.
- Seed 5-10 scoped issues that are safe for external contributors.

Completed presentation prep:

- Added README live app link and seeded screenshots.
- Added GitHub labels for frontend, docs, i18n, accessibility, security, mobile, charts, maps, testing, and public release work.
- Seeded 7 safe starter issues for copy, accessibility, mobile layout, charts, maps, docs, and E2E coverage.

## Final Public Switch

- H-2 closed and tested.
- H-5 hidden PR refs removed or avoided by clean repository recreation, then verified against full remotely advertised history.
- Security re-audit clean on the final clean repository.
- Public API and integration docs still accurate after final repo recreation.
- Creator/API docs still match the deployed product after final repo recreation.
- Branch protection and `production` environment reviewer gate enabled.
- Repository visibility changed to public.
