# Orider Web

[한국어](README.md) | [English](README-en.md)

**Orider Web** is the production web frontend for the Orider cycling computer platform. It provides ride analysis, fitness and training dashboards, an AI coach, route and segment discovery, community features, and club and event operations.

[Live app](https://orider.co.kr) · [Contributing](CONTRIBUTING-en.md) · [Development](docs/DEVELOPMENT-en.md) · [Branching model](docs/BRANCHING-en.md) · [Contributor architecture](docs/CONTRIBUTOR_ARCHITECTURE-en.md) · [API and integrations](docs/API_AND_INTEGRATIONS-en.md) · [Security](SECURITY-en.md)

## Repository Scope

This repository contains the public frontend source.

- Included: React/Vite app code, TypeScript UI, i18n resources, design tokens, pure training/simulation utilities, tests, docs, and static assets
- Excluded: Cloud Functions, Firestore/Storage production rules, private analysis pipelines, server-side AI/training logic, service accounts, and operational secrets

Frontend code is not a security boundary. Authorization and privacy guarantees must be enforced by backend services and Firebase security rules.

## Quick Start

Requirement: Node.js 24+

```bash
cp .env.example .env
npm ci
npm run dev
```

Common checks:

```bash
npm run lint
npm run check:i18n
npm test
npm run build
npm run e2e
```

`npm test` runs Vitest plus the Node contract tests under `scripts/`. `npm run e2e` runs Firebase Auth/Firestore emulators with Playwright, so it needs the Firebase CLI and Java installed separately; the script's `JAVA_HOME` assumes the macOS Homebrew OpenJDK path.

## Project Map

```text
src/
  pages/          route screens
  components/     shared UI and domain components
  features/       feature-level queries, mutations, types, utilities
  hooks/          reusable React hooks
  services/       Firebase, analytics, API clients
  embedded/       bootstrap and bridge for the `/embed/*` screens shown inside the mobile app
  utils/          pure utilities
  i18n/           Korean and English resources
  theme/          design tokens and UI primitives
shared/
  training/       training, fitness, recovery, load calculations
  analysis/       activity analysis summaries and presentation math
  sim/            pure course/segment simulation functions
design-tokens/    design token source (`npm run gen:design-tokens` refreshes the generated files in `src/theme/`)
manual-src/       web manual source (`npm run gen:manual` generates `public/web-manual/`)
e2e/tests/        Playwright tests
scripts/          build, check, merge-gate, and deploy helper scripts
public/           static assets, manuals, about pages
```

For new features or larger changes, prefer moving queries, mutations, types, and utilities into `src/features/<domain>/` instead of adding more logic to page files. See the [Contributor Architecture Guide](docs/CONTRIBUTOR_ARCHITECTURE-en.md).

## Product Areas

- **Ride analysis**: activity detail, maps, power/zone/lap/segment analysis, GPX/TCX/FIT/CSV exports
- **Fitness and training**: bike/run/swim/triathlon views, plans, logs, today's workout, pure training calculations, yearly records (`/athlete/me/records`)
- **AI coach**: questions and answers grounded in your own workout records at `/coach`, with condition, analysis, training plan, and goals views
- **Routes and discovery**: `/explore/*` (courses, segments, clubs, events, challenges, athletes), course creation/editing, segments, leaderboards, personal heatmap/tile integration, course prediction lab (`/lab`)
- **Community and Creator Hub**: board, friends, athlete profiles, personal-data recipes and share cards (`/records/studio`), developer API guide (`/settings/developer`)
- **Clubs and events**: club dashboards (`/clubs`; legacy `/group/*` paths redirect to `/club/*`), members/rides/weekly ranking, club meeting preparation and live spectating, event registration, live views, results, organizer screens
- **In-app embeds**: `/embed/*` routes that let the mobile app reuse the same screens

## Contributing

Good first contribution areas:

- Korean/English translation and product copy
- Accessibility labels, keyboard flow, focus order, semantic markup
- Mobile web layout and empty/loading/error states
- Chart readability, map fallbacks, test coverage
- Documentation, screenshots, setup notes

Before a PR, run the checks that match your change: `npm run lint:budget`, `npm run quality:budget`, `npm run check:i18n`, `npm test`, `npm run build`, and `npm run e2e`. Sign commits with `git commit -s` for DCO compliance.

## Branch and PR Flow

Orider Web uses an integration branch, `dev`, and a production branch, `main`.

```text
fork/topic branch ──┐
                    ├─ pull request ── review/merge gate ── squash ── dev ── promotion PR ── main ── tag v* ── protected deploy
maintainer/topic ───┘
```

- Feature and fix PRs target `dev` (`gh pr create --base dev`).
- `main` is the protected production branch. It only accepts promotion PRs from `dev` (or a fixed snapshot of it, `promote/snapshot-*`) and urgent `hotfix/*` PRs; `main-promote-guard.yml` rejects any other head.
- Merging to `main` does not deploy production automatically.
- Pushing a `v*` version tag on a commit contained in `main` deploys Hosting through a protected GitHub Environment and creates GitHub Release notes.
- Every change goes through a short-lived topic branch and Pull Request.
- Branch names use one of `feat/`, `fix/`, `hotfix/`, `docs/`, `test/`, `refactor/`, `ci/`, `chore/`, `security/`, `style/`, `perf/`, or `build/`.
- External contributors branch from forks and open PRs.
- Maintainers do not push directly to `dev` or `main`; they merge through the `scripts/merge-pr.sh` merge gate.

Detailed rules and examples live in [Branching Model](docs/BRANCHING-en.md).

The `DCO` check runs on PRs to both `dev` and `main`. `PR metadata` and `CI / check` run on PRs to `main` (promotions and hotfixes); for PRs to `dev`, maintainers verify lint/quality/test/build in the merge gate. These workflows run without secrets, and docs-only PRs skip heavy npm work while still reporting success.

## Personal Data and API

Orider provides a small owner-only Personal Data API for signed-in riders who want to use their own data. It does not yet provide a broad third-party app platform or OAuth app registration. External automation should use the [Personal Data API](docs/PERSONAL_DATA_API-en.md), not scrape Firebase callable endpoints.

See [Personal Data Recipes](docs/recipes/personal-data-en.md) and [Creator Showcase](docs/CREATOR_SHOWCASE-en.md) for examples.

## Public Repository Status

The public source-of-truth repository is [`miranae/orider-web`](https://github.com/miranae/orider-web). Instead of exposing old private history, the project switched by recreating a clean production-source repository from the reviewed working tree.

README screenshots are omitted until they can be regenerated with demo-safe current-product data. See [Public Repository Cutover](docs/PUBLIC_REPOSITORY_CUTOVER-en.md) for the migration history.

## License and Trademark

- Code: [GNU AGPL-3.0](LICENSE)
- Contributions: [DCO 1.1](DCO-en.md)
- Governance and mission: [MISSION.md](MISSION-en.md), [GOVERNANCE.md](GOVERNANCE-en.md), [FUNDING.md](FUNDING-en.md)
- Brand: "Orider", "ORIDER", and the Orider logo are trademarks and are not granted by the code license. Forks should use their own branding. See [TRADEMARK.md](TRADEMARK-en.md).
