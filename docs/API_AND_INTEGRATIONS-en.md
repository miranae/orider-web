# API and Integration Boundaries

Orider Web is a production frontend. Its Firebase, Mapbox, Strava, and App Check browser configuration is intentionally shipped to the client bundle and should be treated as public configuration, not as a secret.

This document describes the integration model for the web client. It is not a stable third-party API contract.

Security-sensitive controls live outside this repository:

- Firebase Auth identity checks,
- Firestore and Storage security rules,
- Cloud Functions authorization,
- callable App Check enforcement,
- server-side rate limits and abuse caps,
- provider-side domain, redirect URI, and API-token restrictions.

## Quick Reference

| Need | Use | Stability |
|---|---|---|
| Build or test frontend UI | Vite app, React pages, mocked/emulator data | Supported contribution path |
| Reuse sport calculations | `shared/training/*`, `src/utils/*` pure functions | Reasonably stable, covered by tests |
| Reuse export behavior | `src/utils/exportGpx.ts`, `exportTcx.ts`, `exportFit.ts`, `exportCsv.ts` | Reasonably stable, covered by tests |
| Study Firebase client wiring | `src/services/firebase.ts`, hooks, settings panes | Reference only |
| Build with your own Orider data | Settings → Developer API, Personal Data API docs, recipe docs | Live owner-only read foundation; broader platform still early |
| Call Orider callable functions directly | Firebase callable endpoints | Not a supported public API |
| Self-host Orider backend | Cloud Functions/rules/pipelines | Not available from this repository |

## Fastest Useful Paths

Choose the path that matches what you want to build:

| Goal | Start here | Expected result |
|---|---|---|
| Improve the product UI | `npm install`, placeholder env, `npm run dev` | Local app shell, routes, empty states, and reviewable UI. |
| Reuse calculation logic | Import from `shared/training/*` | Pure TypeScript functions with no Firebase dependency. |
| Reuse export logic | Import from `src/utils/export*.ts` | GPX, TCX, FIT, CSV, and calendar export reference behavior. |
| Build integration UI | Mock Firebase/Mapbox/Strava responses at the component boundary | Reviewable provider states without production access. |
| Plan personal data tools | Create a key in Settings → Developer API, then read `docs/PERSONAL_DATA_API.md` and `docs/recipes/personal-data.md` | Draft charts, alerts, reports, and automation using owned data only. |
| Study production wiring | Read `src/services/firebase.ts` and settings/integration pages | Understand browser-safe config and client SDK initialization. |

Frontend-only setup:

```bash
npm install
cp .env.example .env
npm run dev
```

For compile-only checks, placeholder Firebase values are enough:

```bash
VITE_FIREBASE_API_KEY=dummy \
VITE_FIREBASE_AUTH_DOMAIN=dummy.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=dummy \
VITE_FIREBASE_APP_ID=dummy \
npm run build
```

For provider-backed local development, add only browser-safe public values such as `VITE_MAPBOX_TOKEN`, `VITE_STRAVA_CLIENT_ID`, and `VITE_APPCHECK_RECAPTCHA_SITE_KEY`. Production secrets, service accounts, private rules, and backend jobs are not required for UI contribution work and are not included in this repository.

Do not commit App Check debug tokens. They are test-only bypass credentials and must never be built into production bundles or public documentation.

## Public Client Configuration

The following Vite variables are browser-safe configuration values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_APPCHECK_RECAPTCHA_SITE_KEY`
- `VITE_MAPBOX_TOKEN`
- `VITE_STRAVA_CLIENT_ID`
- `VITE_STRAVA_REDIRECT_URI`

They allow the web app to find the correct Firebase project and third-party integrations. They do not grant backend admin access by themselves.

Those values make the browser client point at provider projects; access is still limited by provider configuration, Firebase Auth, App Check, backend authorization, and rules.

## Firebase Access Model

Local frontend development can run against the production Firebase project when `.env` contains the public config values, but write and read access still depends on the signed-in Firebase user and backend rules.

Expected behavior:

- Signed-out users can only use public surfaces.
- Signed-in users can access their own private data.
- Public documents and public media are readable by design.
- Root user documents are kept public-safe; sensitive user fields belong in owner-only private subdocuments.
- Expensive callable functions require Firebase App Check and authenticated users.

This repository does not include the production Cloud Functions source, Firestore rules, Storage rules, service accounts, or operational exports.

## Cloud Functions and API Surface

The web app calls Firebase callable functions through the Firebase client SDK. Those callable endpoints are part of the Orider product surface, not a general-purpose public API for automation or scraping.

External developers should treat this repository as a reference for the frontend integration shape:

- how the web client initializes Firebase services,
- where Mapbox and Strava browser configuration enters the app,
- how UI code separates public config from server-side secrets,
- which screens can degrade when a provider is unavailable.

Do not assume callable function names, request payloads, or response shapes are stable unless a separate public API document explicitly says so.

The intended public developer path is different: the Personal Data API provides a small owner-only read foundation for a rider's own profile, activities, streams, and fitness summary. Riders can create scoped keys in **Settings → Developer API**. See [Personal Data API](PERSONAL_DATA_API-en.md) for live endpoints, scopes, and [Personal Data Recipes](recipes/personal-data-en.md) for community recipe ideas.

Callable protections used in production:

- Firebase Auth for user identity,
- App Check for browser/app attestation,
- per-user rate limits on costly or external-provider functions,
- server-side provider secrets held in Secret Manager,
- strict ownership checks before private data reads or writes.

Maintainer-only production E2E may use a temporary App Check debug token registered in Firebase App Check for the duration of a test. The token must be deleted after verification and must not be stored in git, GitHub secrets for public builds, screenshots, logs, or docs.

## What External Developers Can Use

The most reusable parts of this repository are frontend and pure TypeScript surfaces:

| Area | Useful for |
|---|---|
| `shared/training/` | Fitness/readiness calculations, workout import, weekly load, segment prediction, and tests. |
| `src/utils/export*.ts` | GPX, TCX, FIT, CSV, and calendar export behavior. |
| `src/components/` and `src/pages/` | Sports analytics UI, map fallback patterns, chart states, and mobile workflows. |
| `src/i18n/resources/` | Korean/English cycling, training, event, and settings terminology. |
| `.github/workflows/` | CI/deploy pattern for a Firebase Hosting frontend without exposing production secrets to PRs. |

## Practical Recipes

Use these as starting points for contribution or reuse.

### Example: Readiness Calculation

`shared/training/readiness.ts` is a pure function: no Firebase, no network, no production data.

```ts
import { estimateReadiness } from "./shared/training/readiness";

const readiness = estimateReadiness({
  hrvRmssd: 62,
  hrvBaselineMean: 55,
  restingHr: 48,
  rhrBaselineMean: 51,
  sleepHours: 7.5,
});

// { score, band, factors } or null when no usable input exists.
```

### Example: GPX Export

`src/utils/exportGpx.ts` turns an activity and stream arrays into GPX XML. It is useful as a reference for sport-data export behavior and edge cases such as stream time normalization.

```ts
import { generateGpx } from "./src/utils/exportGpx";

const gpx = generateGpx(activity, {
  latlng: [[37.5665, 126.9780]],
  time: [0],
  altitude: [35],
  heartrate: [145],
  watts: [210],
  cadence: [88],
});
```

### Example: Provider Fallback UI

Mapbox and Firebase-backed screens should remain reviewable when provider config is missing or blocked. For contribution work, prefer:

- stable containers for chart/map placeholders,
- explicit empty/loading/error states,
- mocked inputs for pure utilities,
- emulator data for Auth/Firestore-oriented UI,
- no dependency on production users, routes, or tokens.

### Example: Integration Boundary

When adding a feature that touches Firebase, Mapbox, Strava, or App Check:

1. Keep public browser configuration in `VITE_*` env variables.
2. Keep secrets and privileged provider calls out of frontend code.
3. Make missing-provider states visible and testable.
4. Treat Firebase callable payloads as internal product contracts unless a public API document exists.
5. Add tests around pure transformation logic before wiring it to provider data.

## Stability Expectations

| Surface | Expected compatibility |
|---|---|
| Pure utilities with tests | Changes should be reviewed like public library code. Prefer backwards-compatible signatures. |
| React components/pages | Product UI may change, but states should remain testable with placeholder or mocked data. |
| Vite env names | Public browser config names should stay stable unless documented in release notes. |
| Firebase callable names/payloads | Internal product API. May change without public deprecation policy. |
| Firestore document shape | Product data model. Not a public contract from this repository. |

## Not Currently Offered

This repository does not currently provide:

- broad third-party app registration,
- OAuth app consent for external developers,
- webhook subscriptions for external apps,
- service-level guarantees for callable endpoints,
- self-hostable backend services,
- production Firestore/Storage rules.

Before the Personal Data API expands beyond the current owner-only read foundation, additional endpoints should be documented with authentication, scopes, rate limits, sample requests/responses, versioning, and deprecation policy.

## Strava

The Strava client ID and redirect URI are public OAuth configuration. The Strava client secret, webhook verify token, and webhook subscription metadata are server-side secrets.

Public clients can start OAuth, but token exchange and token storage are handled by Cloud Functions. Redirect URIs must remain restricted in the Strava app settings.

## Mapbox

The Mapbox token used by the frontend must be a public token with URL/domain restrictions. It should not have secret scopes or management permissions.

Map surfaces should degrade with fallback UI when Mapbox is unavailable, blocked, or rate-limited.

## Local Development Limits

Without access to the private backend and production secrets, contributors can still work on:

- React pages and components,
- charts and map UI states,
- i18n resources,
- accessibility fixes,
- unit tests,
- Playwright tests using mocked or seeded data,
- local emulator-oriented flows documented in `docs/DEVELOPMENT.md`.

Provider integrations that require production secrets or privileged backend jobs are not self-hostable from this repository alone.
