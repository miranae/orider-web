# Public Repository Notes

This document records the public-release posture for Orider Web after the clean repository cutover. It is no longer a pre-release blocker checklist; the public source-of-truth repository is [`miranae/orider-web`](https://github.com/miranae/orider-web).

## Current Status

| Area | Status | Notes |
|---|---|---|
| Public repository | Done | Public work happens in `miranae/orider-web`; old private history was not mirror-pushed. |
| README and contributor path | Done | README, CONTRIBUTING, BRANCHING, PR templates, and CI gates describe public contribution flow. |
| PR gates | Done | `PR metadata`, `DCO`, and `CI / check` run on fork-safe `pull_request` workflows without secrets. |
| Deployment | Done | Version tags matching `v*` deploy Firebase Hosting through a protected production environment and create GitHub Release notes. |
| Backend boundary | Ongoing | Functions, Firestore/Storage rules, private jobs, and production data remain outside this repository. |
| Screenshots | Pending | README screenshots are omitted until current-product captures can be regenerated with demo-safe data. |
| Personal Data API docs | Active | Owner-only Personal Data API docs and recipe examples are public; broad third-party app registration is not offered. |

## Public Repository Principles

- Keep the public repo useful without implying that the private backend is included.
- Do not rely on security-through-obscurity for frontend paths, callable names, or Firebase config.
- Do not commit secrets, production exports, service accounts, private user data, or sensitive screenshots.
- Keep public issues and PRs safe for external contributors; route vulnerabilities through [SECURITY.md](../SECURITY.md).
- Prefer small PRs with clear review routes, locales, viewport notes, and screenshots when UI changes.

## Backend Boundary

This repository may expose browser-visible integration points, but authorization and privacy guarantees belong to backend services and Firebase rules maintained separately.

Frontend contributors can work on:

- UI, layout, states, accessibility, i18n, tests, and docs
- pure utilities in `shared/`
- public Personal Data API documentation and demo-safe recipes

Frontend contributors should not expect to change from this repository:

- Cloud Functions implementations
- production Firestore or Storage rules
- provider secrets or token exchange logic
- private analysis pipelines
- production datasets or exports

## Remaining Public Polish

- Regenerate README screenshots from the live product using demo-safe data.
- Keep starter issues labeled for `good first issue`, `accessibility`, `i18n`, `docs`, `frontend`, `testing`, `charts`, and `maps`.
- Periodically check that README, CONTRIBUTING, BRANCHING, and PR gates still match the actual workflow.
- Keep Personal Data API and Creator Hub docs aligned with deployed behavior.

## Historical Cutover Notes

The public repository was created from a reviewed working tree rather than a mirror push. That avoided carrying old private commits, hidden PR refs, deleted refs, and local history into the public release surface.

For the cutover runbook and scan commands, see [Public Repository Cutover](PUBLIC_REPOSITORY_CUTOVER.md).
