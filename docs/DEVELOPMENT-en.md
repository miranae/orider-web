# Development and Deployment

This repository is the **source of truth for the Orider web frontend**. It is not a mirror: development happens here, and production Hosting deploys happen from here.

Project stewardship is documented in [../MISSION.md](../MISSION-en.md), [../GOVERNANCE.md](../GOVERNANCE-en.md), and [../FUNDING.md](../FUNDING-en.md). Contributions use the DCO process in [../DCO.md](../DCO-en.md).

## Deployment Model

```text
contributor PR -> CI(lint/test/build) -> review -> main -> tag vX.Y.Z
                                            |                 |
                                            v                 v
                         deploy-stage.yml builds+verifies   deploy.yml downloads
                         stage and uploads dist artifact     verified artifact
                                            |                 |
                                            v                 v
                         Firebase Hosting stage              Firebase Hosting production
                                                              + GitHub Release notes
```

- Pull requests run `ci.yml`: lint, unit tests, and build with placeholder public config. No production secrets are exposed to PRs.
- Merging to `main` deploys the stage Hosting site and uploads the verified `dist` artifact for that commit.
- Pushing a version tag such as `v2026.07.01` or `v1.2.3` runs `deploy.yml`: download the verified stage artifact for the tag commit, write production `runtime-config.json`, keyless Google auth through Workload Identity Federation, Hosting-only deploy, live verification, and generated GitHub Release notes.
- Production deploys do not run `npm run build`; the hashed JS/CSS assets are promoted from the stage-verified artifact.
- Production deploys are protected by the `production` GitHub Environment.

Maintainer release flow:

```bash
git checkout main
git pull public main
git tag v2026.07.01
git push public v2026.07.01
```

## Backend Boundary

This repository contains the frontend only. The following stay private and are deployed elsewhere:

- Cloud Functions and callable API implementations.
- Firestore and Storage security rules.
- Analysis engines, batch jobs, AI/training logic, and data pipelines.
- Production datasets, exports, service accounts, and secrets.

The frontend talks to the backend through Firebase SDK calls and Firebase Hosting rewrites. Client code is not a security boundary; authorization must be enforced by backend code and Firestore/Storage rules.

## Local Development

Requirements: Node.js 24+.

```bash
cp .env.example .env
npm ci
npm run dev
```

Use one of these modes:

| Mode | Best for | Notes |
|---|---|---|
| Maintainer Firebase project | Full integration work | Requires real Firebase web config and permissions. |
| Firebase emulators | Auth/Firestore-oriented UI and E2E | `npm run e2e` starts auth/firestore emulators for Playwright. |
| Placeholder config | Static UI/build checks | Good for copy, layout, isolated components, tests, and build validation. |

Some routes will show empty, loading, or permission states without backend data. That is expected for a frontend-only public repo.

## Frontend-Only Review Routes

These routes are useful when working with placeholder config, emulator data, or mocked component state. They do not require private backend source code.

| Route | Review focus | Local expectation |
|---|---|---|
| `/` | App shell, navigation, dashboard cards, loading/empty states | Signed-in production data is not available. |
| `/fitness` | Fitness tabs, chart containers, training copy, responsive layout | Full charts need seeded or mocked activity data. |
| `/courses` | Course list, empty states, route card layout | Production course data may be absent. |
| `/explore` | Map fallback, segment discovery, filter UI | Mapbox/WebGL may degrade in local/test environments. |
| `/events` | Event cards, registration entry points, organizer-oriented UI | Production event data may be absent. |
| `/settings` | Integration panels, training/device settings, form layouts | Auth-dependent panes need emulator or maintainer config. |
| `/board` | Community feed layout, post states, copy | Firestore-backed content needs emulator or mock data. |

For component-level work, prefer isolated states, tests, or seeded fixtures over production data assumptions.

## Common Commands

```bash
npm run dev
npm run lint
npm test
npm run build
npm run e2e
```

`npm run build` runs environment validation, manual generation, TypeScript, and Vite build.

## Environment Variables

`.env.example` lists the public browser configuration needed by Vite. `VITE_FIREBASE_*` values are browser-exposed Firebase web config and are not secrets. Access control still depends on backend validation and Firebase security rules.

Optional integrations such as Mapbox, Strava OAuth, App Check, and Sentry need additional project configuration before the full production surface works locally.

`VITE_ORIDER_PERSONAL_API_BASE` is reserved for local personal-data recipe experiments. The Personal Data API has a small owner-only read surface; do not point public frontend code at private endpoints or treat Firebase callable names as a public contract.

## Personal Data Recipe Work

Personal-data recipes are for riders who want to use their own Orider data in charts, reports, alerts, exports, or automation. They can use the live owner-only Personal Data API where available, and fall back to mocked responses, sample JSON, or exported data for endpoints that are not available yet.

GitHub is only the authoring and review path. The product direction is to surface reviewed recipes and privacy-safe outputs in Orider Creator Hub, so non-developer riders can discover, try, and share them without browsing pull requests.

Good recipe work usually lives in `docs/recipes/` and should document:

- the rider benefit,
- Creator Hub summary,
- required scopes,
- privacy notes,
- shareable result type and default visibility,
- safe polling or rate assumptions,
- sample input/output,
- failure states.

See [Personal Data API](PERSONAL_DATA_API-en.md), [Creator Showcase](CREATOR_SHOWCASE-en.md), and [Personal Data Recipes](recipes/personal-data-en.md).

## GitHub Settings for Maintainers

Keep repository metadata aligned with the public project:

- Description: `Open-source React frontend for Orider, a cycling computer platform for ride analysis, group events, routes, and training dashboards.`
- Website: `https://orider.co.kr`
- Topics: `cycling`, `fitness`, `react`, `vite`, `firebase`, `typescript`, `sports-analytics`

Required protections:

- Branch protection for `main`: PR review required, `PR metadata`, `DCO`, and `CI / check` required, direct pushes disabled.
- GitHub Environment `production`: required reviewers enabled.
- Version tags matching `v*` trigger production deploys and release notes.
- CODEOWNERS for sensitive paths once maintainer roster is final.
- DCO sign-off required through `.github/workflows/dco.yml`; make the `DCO` check required in branch protection.

Required Actions secrets:

| Name | Use |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config |
| `VITE_FIREBASE_APP_ID` | Firebase web config |
| `VITE_STRAVA_CLIENT_ID` | Strava OAuth client id |
| `VITE_MAPBOX_TOKEN` | Mapbox public token |
| `VITE_APPCHECK_RECAPTCHA_SITE_KEY` | Firebase App Check reCAPTCHA Enterprise site key |

Required Actions variables:

| Name | Use |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase Hosting deploy target |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | GitHub Actions WIF provider resource name |
| `GCP_SERVICE_ACCOUNT` | Hosting deploy service account |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase web project id |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_FUNCTIONS_REGION` | Functions region |
| `VITE_STRAVA_REDIRECT_URI` | Strava OAuth callback URI |
| `VITE_SEGMENT_TILES_BASE` | Static segment tile base URL |
| `VITE_HEATMAP_BASE` | Static heatmap data base URL |

Deployment auth uses Workload Identity Federation in `.github/workflows/deploy.yml`, not a long-lived service-account JSON. Public browser config and infrastructure resource names are managed as Actions variables so they are not repeated inline in the workflow.

## Monorepo Split Note

This repository deploys Hosting only:

```bash
firebase deploy --only hosting --project "$FIREBASE_PROJECT_ID"
```

Private backend repositories deploy functions, Firestore rules, and Storage rules. Do not deploy Hosting from backend repositories after the cutover, or the public frontend deploy can be overwritten.
