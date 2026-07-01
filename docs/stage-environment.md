# Stage Environment

Stage is a permanent Firebase Hosting site used to verify `main` before a
tagged production release.

- URL: `https://miranae-orider-g1-stage.web.app`
- Hosting site: `miranae-orider-g1-stage`
- GitHub environment: `stage`
- Deploy workflow: `.github/workflows/deploy-stage.yml`
- Firebase config: `firebase.stage.json`

## Promotion Model

The stage workflow is the only workflow that builds the Vite bundle for a
release commit. After the stage deploy is verified, it uploads the verified
`dist` directory as a GitHub Actions artifact named `web-dist-<commit-sha>`.

Production deploys do not run `npm run build`. A production tag must point at a
commit that already has a successful stage deployment. The production workflow
downloads that verified artifact, rewrites only `dist/runtime-config.json` with
production browser-safe config, and deploys the same hashed JS/CSS assets to
Firebase Hosting production.

This keeps rollbacks and releases fast while preserving the stage gate:

- Code and hashed assets are promoted from the exact stage-verified artifact.
- Stage and production can still use different Firebase, Strava, Mapbox, App
  Check, and endpoint settings through `runtime-config.json`.
- If no successful stage artifact exists for the tag commit, production deploy
  fails before touching Firebase Hosting.

## GitHub Environment Values

The stage workflow must use `STAGE_*` values only. Do not point the stage
workflow directly at production repository-level `VITE_*`, `FIREBASE_*`, or
`GCP_*` values. `npm run check:deploy-config` enforces this.

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

- If stage uses a stage-specific callback, add it to the Strava app callback
  domain and set `STAGE_VITE_STRAVA_REDIRECT_URI` to that callback.
- If stage uses the shared callback proxy, verify that the proxy accepts requests
  from `https://miranae-orider-g1-stage.web.app` and routes the final redirect
  back to the stage site when appropriate.

Firebase / Google API key restrictions:

- If `STAGE_VITE_FIREBASE_API_KEY` is restricted by HTTP referrer, allow
  `https://miranae-orider-g1-stage.web.app/*`.

Mapbox:

- If `STAGE_VITE_MAPBOX_TOKEN` is restricted by URL, allow
  `https://miranae-orider-g1-stage.web.app/*`.

## Current Scope

Stage separates frontend Hosting, GitHub deployment configuration, and runtime
browser config. It still targets the same Firebase project and backend services
unless the `STAGE_*` values are changed to a separate Firebase project and
separate integration apps.
