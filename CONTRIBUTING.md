# Contributing

Thanks for contributing to Orider Web. This repository is the production frontend, so we optimize for small, reviewable changes that can safely reach real users.

## Good First Areas

- Translation and copy polish in `src/i18n/resources/`.
- Accessibility fixes: labels, focus order, keyboard navigation, semantic HTML, and contrast.
- Mobile web layout bugs and responsive polish.
- UI tests around existing flows.
- Personal-data recipe drafts under `docs/recipes/`: owned-data charts, reports, alerts, exports, and automation ideas.
- Documentation improvements, screenshots, and setup notes.

For larger product changes, open an issue or draft PR first so we can align on scope, backend dependencies, and privacy implications.

Branch naming and PR flow are documented in [docs/BRANCHING.md](docs/BRANCHING.md).

## Development Setup

```bash
cp .env.example .env
npm ci
npm run dev
```

Some flows need Firebase services or emulator data. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for what can run locally and what requires maintainer configuration.

## Personal Data Recipes

Recipes help riders use their own Orider data in personal tools. They can use mocked responses, sample JSON, or exported data until the Personal Data API is stable. GitHub is the authoring workflow; the intended rider-facing surface is Orider Creator Hub.

Recipe PRs should include:

- the rider benefit,
- a short Creator Hub showcase summary,
- planned required scopes,
- privacy notes,
- shareable result type and safe default visibility,
- safe polling or rate assumptions,
- sample input/output or a screenshot with demo data only.

Do not include access tokens, real user IDs, emails, precise private routes, production exports, provider secrets, or screenshots containing private data. See [docs/PERSONAL_DATA_API.md](docs/PERSONAL_DATA_API.md), [docs/CREATOR_SHOWCASE.md](docs/CREATOR_SHOWCASE.md), and [docs/recipes/personal-data.md](docs/recipes/personal-data.md).

## Before Opening a PR

Run the relevant checks:

```bash
npm run lint:budget
npm run quality:budget
npm test
npm run build
```

For user-visible flow changes, add or update Playwright coverage when practical:

```bash
npm run e2e
```

## Pull Request Rules

- Work on a branch and submit a Pull Request.
- Keep PRs focused. Separate refactors from behavior changes.
- Do not commit secrets, tokens, `.env`, production exports, or user data.
- Follow [docs/CONTRIBUTOR_ARCHITECTURE.md](docs/CONTRIBUTOR_ARCHITECTURE.md) for feature structure, logging, and Firestore write placement.
- Use Korean for project-facing prose when matching existing product copy; English is fine for general contributor docs.
- Use Conventional Commit-style titles when possible: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`.
- Explain UI token/design-system changes in the PR body.

## PR Checklist

- [ ] No secrets, credentials, production exports, or private user data are included.
- [ ] Personal-data recipes use only owned-data examples, minimal planned scopes, and demo/mock data.
- [ ] `npm run lint:budget` passes within the current warning budget.
- [ ] `npm run quality:budget` passes within the large-file, console, and alert budgets.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] Docs or translations were updated when needed.
- [ ] Security-sensitive behavior was reviewed against [SECURITY.md](SECURITY.md).

## Security

Do not report vulnerabilities in public issues or PR comments. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contribution is provided under this repository's license, [AGPL-3.0](LICENSE).
