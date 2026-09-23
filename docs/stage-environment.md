# Stage Environment

Stage is a permanent Firebase Hosting site used to verify `main` before a
tagged production release.

- URL: `https://miranae-orider-g1-stage.web.app`
- Hosting site: `miranae-orider-g1-stage`
- GitHub environment: `stage`
- Deploy workflow: `.github/workflows/deploy-stage.yml`
- Firebase config: `firebase.stage.json`

## Deployment Model

The stage workflow independently builds and verifies `main` before deploying it
to the permanent stage site. Stage separates only the Hosting site and release
workflow; the browser app uses the production Firebase project, data, backend
services, and AI API so UI changes can be checked against real production data.

Production tags run their own `npm ci` and production-configured build after
the `production` GitHub Environment approval. They then write the production
browser-safe `runtime-config.json`, verify the backend contract, and deploy to
Firebase Hosting. A successful stage deployment is useful validation but is
not a production-release prerequisite.

## GitHub Environment Values

The stage workflow must use `STAGE_*` values only. These names isolate the stage
deployment configuration from repository-level production deployment settings;
they do not select a separate backend environment. Set the Firebase, backend,
and integration values to their production equivalents. `npm run
check:deploy-config` enforces the `STAGE_*` boundary while the stage Hosting CSP
explicitly allows the production AI API origin.

Required `stage` environment variables:

- `STAGE_FIREBASE_PROJECT_ID`
- `STAGE_GCP_SERVICE_ACCOUNT`
- `STAGE_GCP_WORKLOAD_IDENTITY_PROVIDER`
- `STAGE_VITE_FIREBASE_AUTH_DOMAIN`
- `STAGE_VITE_FIREBASE_PROJECT_ID`
- `STAGE_VITE_FIREBASE_STORAGE_BUCKET`
- `STAGE_VITE_FIREBASE_FUNCTIONS_REGION`
- `STAGE_VITE_STRAVA_REDIRECT_URI`
- `STAGE_VITE_SEGMENT_TILES_BASE`
- `STAGE_VITE_HEATMAP_BASE`

Required `stage` environment secrets:

- `STAGE_VITE_FIREBASE_API_KEY`
- `STAGE_VITE_FIREBASE_MESSAGING_SENDER_ID`
- `STAGE_VITE_FIREBASE_APP_ID`
- `STAGE_VITE_STRAVA_CLIENT_ID`
- `STAGE_VITE_APPCHECK_RECAPTCHA_SITE_KEY`

Optional `stage` environment secrets:

- `STAGE_VITE_MAPBOX_TOKEN`

## External Allowlist Checklist

Stage may build and deploy successfully while OAuth or App Check still fails in
the browser. Keep these allowlists in sync whenever the stage hostname changes.

Firebase Authentication:

- Add `miranae-orider-g1-stage.web.app` to Authorized domains.

Firebase App Check / reCAPTCHA Enterprise:

- Allow `miranae-orider-g1-stage.web.app` for the site key used by
  `STAGE_VITE_APPCHECK_RECAPTCHA_SITE_KEY`.

Strava OAuth:

- Use the production Strava integration and shared callback proxy. Verify that
  the proxy accepts requests from `https://miranae-orider-g1-stage.web.app` and
  routes the final redirect back to the stage site when appropriate.

Firebase / Google API key restrictions:

- If `STAGE_VITE_FIREBASE_API_KEY` is restricted by HTTP referrer, allow
  `https://miranae-orider-g1-stage.web.app/*`.

Mapbox:

- If `STAGE_VITE_MAPBOX_TOKEN` is restricted by URL, allow
  `https://miranae-orider-g1-stage.web.app/*`.

## Current Scope

Stage is a production-data UI verification surface. Only the frontend Hosting
site and its deployment workflow are separate. Its `STAGE_*` browser values
must point to the production Firebase project, backend services, AI API, and
integrations. Do not repoint them to a development Firebase project or a
stage-only backend.
