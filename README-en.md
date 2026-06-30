# Orider Web

[한국어](README.md) | [English](README-en.md)

**Orider Web** is the production web frontend for the Orider cycling computer platform. It provides ride analysis, fitness and training dashboards, route and segment discovery, community features, and group event operations.

[Live app](https://orider.co.kr) · [Contributing](CONTRIBUTING-en.md) · [Development](docs/DEVELOPMENT-en.md) · [Branching model](docs/BRANCHING-en.md) · [Contributor architecture](docs/CONTRIBUTOR_ARCHITECTURE-en.md) · [API and integrations](docs/API_AND_INTEGRATIONS-en.md) · [Security](SECURITY-en.md)

## Repository Scope

This repository contains the public frontend source.

- Included: React/Vite app code, TypeScript UI, i18n resources, design tokens, pure training/simulation utilities, tests, docs, and static assets
- Excluded: Cloud Functions, Firestore/Storage production rules, private analysis pipelines, server-side AI/training logic, service accounts, and operational secrets

Frontend code is not a security boundary. Authorization and privacy guarantees must be enforced by backend services and Firebase security rules.

## Quick Start

Requirement: Node.js 20+

```bash
cp .env.example .env
npm ci
npm run dev
```

Common checks:

```bash
npm run lint
npm test
npm run build
npm run e2e
```

`npm run e2e` runs Firebase Auth/Firestore emulators with Playwright.

## Project Map

```text
src/
  pages/          route screens
  components/     shared UI and domain components
  features/       feature-level queries, mutations, types, utilities
  hooks/          reusable React hooks
  services/       Firebase, analytics, API clients
  i18n/           Korean and English resources
  theme/          design tokens and UI primitives
shared/
  training/       training, fitness, recovery, load calculations
  sim/            pure course/segment simulation functions
e2e/tests/        Playwright tests
public/           static assets, manuals, locale payloads
```

For new features or larger changes, prefer moving queries, mutations, types, and utilities into `src/features/<domain>/` instead of adding more logic to page files. See the [Contributor Architecture Guide](docs/CONTRIBUTOR_ARCHITECTURE-en.md).

## Product Areas

- **Ride analysis**: activity detail, maps, power/zone/lap/segment analysis, GPX/TCX/FIT/CSV exports
- **Fitness and training**: bike/run/swim/triathlon views, plans, logs, today's workout, pure training calculations
- **Routes and discovery**: `/discover`, `/explore`, course creation/editing, segments, leaderboards, heatmap/tile integration
- **Community and Creator Hub**: board, friends, athlete profiles, personal-data recipes, share cards
- **Groups and events**: group dashboards, member/ride management, event registration, live views, results, organizer screens

## Contributing

Good first contribution areas:

- Korean/English translation and product copy
- Accessibility labels, keyboard flow, focus order, semantic markup
- Mobile web layout and empty/loading/error states
- Chart readability, map fallbacks, test coverage
- Documentation, screenshots, setup notes

Before a PR, run the checks that match your change: `npm run lint:budget`, `npm run quality:budget`, `npm test`, `npm run build`, and `npm run e2e`. Sign commits with `git commit -s` for DCO compliance.

## Branch and PR Flow

Orider Web uses a simple open-source trunk-based flow.

```text
fork/topic branch ──┐
                    ├─ pull request ── CI/review ── squash/merge ── main ── tag v* ── protected deploy
maintainer/topic ───┘
```

- `main` is the protected production branch.
- Merging to `main` does not deploy production automatically.
- Version tags matching `v*` deploy Hosting through a protected GitHub Environment and create GitHub Release notes.
- Long-lived `develop` branches are not used.
- Every change goes through a short-lived topic branch and Pull Request.
- Branch names use one of `feat/`, `fix/`, `docs/`, `test/`, `refactor/`, `ci/`, `chore/`, `security/`, `style/`, `perf/`, or `build/`.
- External contributors branch from forks and open PRs.
- Maintainers do not push directly to `main`.

Detailed rules and examples live in [Branching Model](docs/BRANCHING-en.md).

Required PR gates are `PR metadata`, `DCO`, and `CI / check`. They run without secrets for fork PRs, and docs-only PRs skip heavy npm work while still reporting success.

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
