# Contributing

Thanks for contributing to Orider Web. This repository is the production frontend, so we keep changes small, reviewable, and safe for real rider data.

## Good First Areas

- Korean/English translation and product copy in `src/i18n/resources/`
- Accessibility labels, keyboard flow, focus order, semantic markup, and contrast
- Mobile web layout, empty states, loading states, and error states
- Chart readability, map fallbacks, and focused tests
- Documentation, setup notes, and demo-safe screenshots
- Personal-data recipe drafts under `docs/recipes/` using only owned, demo, or mocked data

For larger product changes, open an issue or draft PR first so maintainers can align on scope, backend dependency, privacy impact, and design direction.

## Development Setup

```bash
cp .env.example .env
npm ci
npm run dev
```

Some flows need Firebase services or emulator data. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT-en.md) for local modes and maintainer-only integration limits.

## Branch and PR Flow

Use a short-lived topic branch and open a Pull Request. External contributors should branch from a fork; maintainers still do not push directly to `main`.

Branch naming and PR gates are documented in [docs/BRANCHING.md](docs/BRANCHING-en.md). Required checks are:

- `PR metadata`
- `DCO`
- `CI / check`

Use Conventional Commit-style PR titles such as `fix: handle mobile tab overflow` or `docs: simplify README`.

## Before Opening a PR

Run the checks that match your change:

```bash
npm run lint:budget
npm run quality:budget
npm test
npm run build
npm run e2e
```

Docs-only PRs do not need a local build unless the docs describe behavior you changed. User-visible flow changes should include screenshots, recordings, or Playwright coverage when practical.

## Code Shape

Prefer existing project boundaries:

- route composition in `src/pages/`
- reusable UI in `src/components/`
- feature logic in `src/features/<domain>/`
- reusable data loading in `src/hooks/`
- Firebase/API wrappers in `src/services/`
- pure calculations in `shared/`

For new writes, API calls, logging, or feature extraction, follow [docs/CONTRIBUTOR_ARCHITECTURE.md](docs/CONTRIBUTOR_ARCHITECTURE-en.md).

## Personal Data and Recipes

Recipe PRs should document:

- rider benefit
- required scopes
- privacy notes
- safe default visibility
- shareable result type
- demo input/output or screenshots

Do not include access tokens, real user IDs, emails, precise private routes, production exports, provider secrets, or screenshots containing private data. See [docs/PERSONAL_DATA_API.md](docs/PERSONAL_DATA_API-en.md), [docs/CREATOR_SHOWCASE.md](docs/CREATOR_SHOWCASE-en.md), and [docs/recipes/personal-data.md](docs/recipes/personal-data-en.md).

## DCO and License

Sign commits with:

```bash
git commit -s
```

Contributions use the [Developer Certificate of Origin](DCO-en.md), not broad copyright assignment. By contributing, you agree that your contribution is provided under [AGPL-3.0](LICENSE).

## Security

Do not report vulnerabilities in public issues or PR comments. Follow [SECURITY.md](SECURITY-en.md).
