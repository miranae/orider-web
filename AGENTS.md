# Repository Guidelines

## Project Structure & Module Organization

Orider Web is a React 19, Vite, and TypeScript frontend. Application code lives in `src/`: pages in `src/pages/`, UI in `src/components/`, hooks in `src/hooks/`, services in `src/services/`, utilities in `src/utils/`, i18n resources in `src/i18n/resources/`, and design tokens in `src/theme/`. Pure shared modules are under `shared/`. Static assets, generated manuals, and public files live in `public/`; source manual content is in `manual-src/`. Unit tests are colocated as `*.test.ts` or `*.test.tsx`. Playwright E2E tests live in `e2e/tests/`.

## Build, Test, and Development Commands

- `npm ci`: install locked dependencies.
- `npm run dev`: start the Vite dev server on `http://localhost:5173`.
- `npm run lint`: run ESLint over `src/`.
- `npm run lint:budget`: run ESLint with zero warnings allowed.
- `npm run quality:budget`: check repository quality budgets.
- `npm test`: run Vitest once.
- `npm run build`: validate env, generate manuals, type-check, and build with Vite.
- `npm run e2e`: run Playwright against Firebase Auth/Firestore emulators.

## Coding Style & Naming Conventions

Use TypeScript and functional React components. Keep component files in PascalCase, hooks named `useThing.ts`, and utility modules in camelCase. Follow the existing two-space indentation style. Prefer design-system components and tokens from `src/theme/`; ESLint flags Tailwind token bypasses, inline pixel spacing, hard-coded hex colors, and deprecated `rd*` classes. Use aliases such as `@shared` for shared modules.

## Testing Guidelines

Use Vitest with Testing Library for unit and component tests. Name tests after the module under test, for example `ActivityPage.test.tsx` or `exportGpx.test.ts`. Put broad integration flows in `e2e/tests/`; Playwright runs desktop and mobile projects and starts Vite on port `5174`. Add tests for behavior changes, pure utility logic, and user-visible flows.

## Commit & Pull Request Guidelines

Use focused branches and Conventional Commit-style subjects where possible, such as `fix: close public release security gates` or `docs: clarify creator hub recipe usage`. Sign commits with `git commit -s` for DCO compliance. Before opening a PR, run relevant checks, usually `npm run lint:budget`, `npm run quality:budget`, `npm test`, and `npm run build`. PRs should describe scope, link issues, include UI screenshots, and note routes, locale, viewport, or data state needed for review.

## Security & Configuration Tips

Do not commit `.env`, tokens, production exports, service accounts, private user data, or screenshots with sensitive ride details. Browser-exposed `VITE_*` Firebase, Mapbox, Strava, and App Check values are public config, but authorization belongs in backend services and Firebase rules.
