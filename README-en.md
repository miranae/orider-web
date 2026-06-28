# Orider Web

Ride analysis, group events, route discovery, and training dashboards for **Orider**, a cycling computer platform.

[Live app](https://orider.co.kr) · [Mission](MISSION-en.md) · [Contributing](CONTRIBUTING-en.md) · [Governance](GOVERNANCE-en.md) · [Development](docs/DEVELOPMENT-en.md) · [API and integrations](docs/API_AND_INTEGRATIONS-en.md) · [Personal Data API](docs/PERSONAL_DATA_API-en.md) · [Creator Showcase](docs/CREATOR_SHOWCASE-en.md) · [Security](SECURITY-en.md)

Orider connects ride records, route intelligence, training feedback, and group ride operations in one web experience. The public frontend is useful for people who care about sport analytics UI: clear charts, reliable maps, mobile-first workflows, Korean/English product copy, and accessible interaction patterns.

Orider Web is not a sample app or a marketing shell. It is the production web client used by riders to review activities, inspect power and fitness trends, manage routes and segments, join communities, and run group events.

Orider started as a small gift from a long-time cyclist to people who love riding. The intent is not to turn the community-built core into a closed private product, but to grow it into **Our Rider** and **Open Rider**: a platform riders can inspect, improve, and trust.

> This repository is the **production source of truth** for the Orider web frontend.
> It is not a mirror: development happens here, PRs are reviewed here, and `main` deploys to Firebase Hosting through a protected workflow.
>
> Backend services, security rules, analysis pipelines, and operational tooling are maintained separately.

## Who It Helps

| Audience | What Orider helps with | What this repository exposes |
|---|---|---|
| Riders | Review activities, pacing, power, zones, routes, fitness, and training readiness. | Product UI, charts, maps, export flows, mobile layouts, and copy. |
| Clubs and teams | Coordinate group rides, members, leaderboards, events, and live operations. | Group/event screens, navigation patterns, participant tables, and map UX. |
| Frontend contributors | Improve real production surfaces without needing private backend code. | React components, i18n resources, tests, screenshots, docs, and pure utilities. |
| Product/UX developers | Study a sports analytics frontend with repeated workflows and dense data. | Dashboard, activity detail, route/segment, training, and event UI patterns. |
| Integration-minded developers | Understand how a Firebase/Mapbox/Strava production web client is wired. | Public browser config, integration boundaries, and client-side SDK usage. |
| Personal-data builders | Build charts, alerts, reports, and automations using their own Orider data. | Minimum owner-only Personal Data API, recipe template, reusable training/export utilities. |

## What Is Reusable

- **Training utilities** in `shared/training/`: readiness, fitness, weekly load, recovery time, rider type, workout import, segment prediction, and related tests.
- **Export utilities** in `src/utils/`: GPX, TCX, FIT, CSV, and calendar-oriented exports.
- **Analytics UI patterns** in `src/components/AnalysisTab.tsx`, chart components, map components, and route/segment pages.
- **Internationalization structure** in `src/i18n/resources/ko/` and `src/i18n/resources/en/`.
- **Testing and CI patterns** for a Vite/Firebase frontend that keeps production secrets out of PR builds.

Backend APIs, production rules, private data pipelines, and server-side analysis jobs are not reusable from this repository.

## Personal Data Direction

Orider's developer direction is personal data access: riders should be able to use their own Orider data in personal dashboards, notebooks, alerts, reports, and automation.

The first public API surface is read-only, owner-only access to a signed-in rider's profile, activities, streams, and fitness summary. Broader app registration and automation scopes are still early; current Firebase callable endpoints should not be scraped as a substitute.

Useful starting points:

- [Personal Data API](docs/PERSONAL_DATA_API-en.md) for live minimum endpoints, scopes, and security requirements.
- [Personal Data Recipes](docs/recipes/personal-data-en.md) for flagship examples such as AI ride diaries, weekly load emails, hard-day alerts, long-ride log packages, and monthly ride badges.
- [Creator Showcase](docs/CREATOR_SHOWCASE-en.md) for the product surface where riders can discover recipes, try ideas, and share privacy-safe result cards.
- `shared/training/` and `src/utils/export*.ts` for local calculations and export behavior that can be tested without production API access.

## Why This Exists

Most cycling platforms split the experience across a device app, a social network, a training dashboard, and event tools. Orider tries to keep those surfaces connected:

- record and import rides,
- analyze power, pacing, zones, routes, and segments,
- follow fitness across bike, run, swim, and triathlon views,
- coordinate groups and live events,
- keep the web frontend open enough for translation, accessibility, UI, and test contributions.

The web frontend is open-source because a large part of the product experience is UI clarity: charts, route maps, mobile flows, Korean/English copy, empty states, accessibility, and documentation.

The project uses AGPL-3.0, DCO-based contributions, public governance, and a separate trademark policy to keep the core hard to privatize while protecting riders and official service identity. See [MISSION.md](MISSION-en.md), [GOVERNANCE.md](GOVERNANCE-en.md), [DCO.md](DCO-en.md), [FUNDING.md](FUNDING-en.md), and [TRADEMARK.md](TRADEMARK-en.md).

## What You Can Explore

### Ride Analysis

- Activity detail pages with maps, exports, power metrics, lap tables, segment efforts, social actions, and edit/upload flows.
- Analysis components for power curves, zones, recovery estimates, rider type, cohort rankings, metabolism, virtual power badges, and AI-facing summary cards.
- Export utilities for GPX, TCX, FIT, CSV, and calendar-oriented outputs.

Relevant code:

- `src/pages/ActivityPage.tsx`
- `src/components/AnalysisTab.tsx`
- `src/components/PowerCurveChart.tsx`
- `src/components/ZoneDistributionChart.tsx`
- `src/utils/exportGpx.ts`, `src/utils/exportFit.ts`, `src/utils/exportTcx.ts`

### Fitness and Training

- Bike, run, swim, and triathlon fitness views.
- Training log, goal setup, plan page, workout editing, today's workout cards, load/adaptation banners, and fitness projections.
- Shared pure training modules for FTP tests, recovery time, readiness, expected power, weekly load, VO2max, workout import, and segment prediction.

Relevant code:

- `src/pages/FitnessPage.tsx`
- `src/pages/fitness/BikeFitnessView.tsx`
- `src/pages/fitness/RunFitnessView.tsx`
- `src/pages/fitness/SwimFitnessView.tsx`
- `src/pages/fitness/TriFitnessView.tsx`
- `src/pages/PlanPage.tsx`
- `shared/training/`

### Routes, Segments, and Discovery

- Course creation and edit flows, route maps, elevation charts, route import/export, segment pages, leaderboards, challenge feed, and heatmap/tiles integration hooks.
- Mapbox-powered surfaces with fallback placeholders for environments without map support.

Relevant code:

- `src/pages/CoursesPage.tsx`
- `src/pages/CoursePage.tsx`
- `src/pages/CreateCoursePage.tsx`
- `src/pages/SegmentPage.tsx`
- `src/pages/ExplorePage.tsx`
- `src/components/RouteMap.tsx`
- `src/components/explore/HeatmapLayer.tsx`

### Groups, Community, and Social

- Board posts, comments, friend flows, athlete profiles, group dashboards, member management, group rides, and group leaderboards.
- Mobile-focused feed/log/plan/settings components for repeated rider workflows.

Relevant code:

- `src/pages/BoardPage.tsx`
- `src/pages/PostDetailPage.tsx`
- `src/pages/FriendsPage.tsx`
- `src/pages/AthletePage.tsx`
- `src/pages/group/`
- `src/components/mobile/`

### Events

- Event creation/editing, registration, participant tables, live event views, organizer dashboards, event maps, and results.
- Useful for granfondo-style rides, group monitoring, and public event pages.

Relevant code:

- `src/pages/event/EventDetailPage.tsx`
- `src/pages/event/EventLivePage.tsx`
- `src/pages/event/EventDashboardPage.tsx`
- `src/pages/event/EventParticipantsPage.tsx`
- `src/components/event/EventMap.tsx`

### Internationalization and Product Copy

- Korean and English resources are first-class project files.
- Copy, empty states, settings labels, onboarding wording, and event/social terminology are good contribution areas.

Relevant code:

- `src/i18n/resources/ko/`
- `src/i18n/resources/en/`
- `src/components/i18n/`

## Screenshots

README screenshots are temporarily omitted until they can be regenerated from the current product UI with demo-safe data. Public-facing screenshots must be captured from the real application, reviewed for privacy, and kept in sync with the live product.

## Architecture Boundaries

This repository contains:

- React/Vite frontend code,
- shared TypeScript types and pure training utilities used by the frontend,
- generated manuals and public static assets,
- CI, deployment, issue, and PR templates.

This repository does **not** contain:

- Cloud Functions implementations,
- Firestore or Storage production rules,
- private analysis pipelines,
- server-side AI/training logic,
- service accounts, production exports, or operational secrets.

Frontend code is not a security boundary. Access control must be enforced by backend services and Firebase security rules.

Browser configuration values such as Firebase project IDs, App Check site keys, Mapbox public tokens, and Strava client IDs are public by design. See [API and integrations](docs/API_AND_INTEGRATIONS-en.md) for the production access model and local development limits.

Orider now offers a small owner-only Personal Data API for signed-in riders who want to use their own data. It does **not** yet offer a broad third-party app platform, OAuth app registration, or reusable backend from this repository. External automation should use scoped Personal Data API keys, not scrape Firebase callable endpoints.

## Tech Stack

- React 19, Vite, TypeScript
- Firebase client SDK: Auth, Firestore, Functions, Hosting
- TanStack Query, i18next, Chart.js, Mapbox GL
- Vitest and Playwright
- GitHub Actions with protected production deploys

## Local Development

Requirements: Node.js 20+.

```bash
cp .env.example .env
npm ci
npm run dev
```

Open the local Vite URL shown in the terminal, usually `http://localhost:5173`.

Common checks:

```bash
npm run lint
npm test
npm run build
npm run e2e
```

Development modes:

| Mode | Good for | Notes |
|---|---|---|
| Placeholder config | Docs, copy, layout, pure components, unit tests | Some routes show loading/empty/permission states. |
| Firebase emulators | Auth and Firestore-oriented tests | `npm run e2e` starts auth/firestore emulators. |
| Maintainer Firebase project | Full integration work | Requires maintainer-provided config and permissions. |

Useful routes for frontend-only review:

| Route | Useful for | Expected without production data |
|---|---|---|
| `/` | App shell, dashboard layout, navigation, loading states | May show empty or login-dependent states. |
| `/fitness` | Fitness tabs, chart containers, training copy | Requires mock/seeded data for full charts. |
| `/courses` | Course list UI, route cards, empty states | May show empty state. |
| `/explore` | Map fallback, segment discovery layout | Mapbox may fall back without a valid token. |
| `/events` | Event list and operations entry points | May show empty state. |
| `/settings` | Account, integrations, training, device settings UI | Signed-in flows need Firebase/Auth context. |

### What Can Contributors Do?

The fastest path depends on what you want to change:

| Goal | Start here | Run before PR |
|---|---|---|
| Fix copy or translations | `src/i18n/resources/ko/`, `src/i18n/resources/en/` | `npm test` |
| Improve layout or UI states | `src/pages/`, `src/components/`, `src/components/mobile/` | `npm run lint`, `npm run build` |
| Improve charts or ride analysis | `src/components/AnalysisTab.tsx`, `src/utils/`, `shared/training/` | `npm test`, `npm run build` |
| Improve docs or setup notes | `README.md`, `CONTRIBUTING.md`, `docs/` | No full build required unless code changed |
| Add E2E coverage | `tests/`, Playwright config | `npm run e2e` |

Without maintainer Firebase access, focus on UI, copy, tests, pure utilities, docs, and components that can be exercised with placeholder config or mocked data. Backend behavior such as Cloud Functions, Firestore rules, Strava token exchange, and production analysis pipelines cannot be changed from this repository.

See [Development and Deployment](docs/DEVELOPMENT-en.md) for details.

## Contributing

Good first contribution areas:

- Korean/English translation and product copy.
- Accessibility labels, keyboard flow, focus order, and semantic markup.
- Mobile web layout issues.
- Chart readability and empty/loading/error states.
- Playwright coverage for repeated user flows.
- Documentation, screenshots, and setup notes.

Branch naming and PR flow are documented in [Branching Model](docs/BRANCHING-en.md). Security-sensitive issues should not be filed publicly; use [SECURITY.md](SECURITY-en.md).

Contributions use the [Developer Certificate of Origin](DCO-en.md). Sign commits with `git commit -s` so the contribution remains under the project license without broad copyright assignment.

### Before Opening a Pull Request

1. Create a branch from `main`.
2. Keep the PR focused on one user-visible fix, one component area, or one documentation improvement.
3. Run the smallest relevant checks from the table above.
4. Include screenshots or screen recordings for UI changes when possible.
5. Explain any route, browser size, locale, or data state needed to review the change.

External contributors can open PRs after the repository is public. Maintainers review and merge through protected `main`; direct pushes to `main` are disabled.

## Repository Model

- `main` is protected.
- All changes go through Pull Requests.
- CI runs on PRs.
- `main` deploys Hosting through a protected GitHub Environment.
- Backend repositories deploy functions, database rules, storage rules, and private jobs.

## Public Release Status

This repository is preparing for public release and remains private while public-release gates are verified.

Tracked blockers:

- Backend security gates H-2/H-3/H-4/H-1 must be closed and live-verified in the private backend repository.
- Current-product screenshots must be regenerated and verified.
- Re-run the final frontend/backend security review before changing visibility.

See [Public Release Checklist](docs/PUBLIC_RELEASE_CHECKLIST-en.md).

The intended final switch is a clean repository recreation from the reviewed working tree, not a mirror push of private history. See [Public Repository Cutover](docs/PUBLIC_REPOSITORY_CUTOVER-en.md).

## License and Trademark

- Code: [GNU AGPL-3.0](LICENSE)
- Contributions: [DCO 1.1](DCO-en.md)
- Governance and mission: [MISSION.md](MISSION-en.md), [GOVERNANCE.md](GOVERNANCE-en.md), [FUNDING.md](FUNDING-en.md)
- Brand: "Orider", "ORIDER", and the Orider logo are trademarks and are not granted by the code license. Forks should use their own branding. See [TRADEMARK.md](TRADEMARK-en.md).

## Links

- [Contributing](CONTRIBUTING-en.md)
- [Security Policy](SECURITY-en.md)
- [Development and Deployment](docs/DEVELOPMENT-en.md)
- [Branching Model](docs/BRANCHING-en.md)
- [Public Release Checklist](docs/PUBLIC_RELEASE_CHECKLIST-en.md)
