# Security Re-audit Snapshot - 2026-06-28

Scope: public-release candidate surface for `miranae/orider-web`.

This is the refreshed pre-publication re-audit of the clean production-source frontend repository after repository cutover.

## Summary

| Area | Result | Notes |
|---|---|---|
| Admin/private feature traces | Pass | No source or public docs matches for admin routes, impersonation pages, admin origin env, admin claims, or admin-only UI. |
| Secret-like strings | Pass with expected false positives | No Strava webhook token, client secret, private key, service account, Firebase real API key, or Mapbox token was found. Matches are public docs, test fixture passwords, runtime ID-token variables, export helpers, and design-token wording. |
| Tracked env files | Pass | `.env.e2e` contains fake emulator values only. `.env.example` contains placeholders only. `.env` and local variants are ignored. |
| Tests | Pass | `npm test`: 71 files, 577 tests passed with Node/jsdom warning output cleaned up. |
| Lint | Pass | `npm run lint:budget`: 0 warnings. |
| Build | Pass | `npm run build` passed with dummy public Firebase config and no Vite/manual-generation warnings. |
| Runtime dependency audit | Pass | `npm audit --omit=dev`: 0 vulnerabilities after public dependency audit cleanup. |
| Firestore rules tests | Pass | Backend Firestore emulator rules test suite passed: 18 tests. |
| Backend gates | Blocked pending private-backend verification | Frontend cleanup is not sufficient for public visibility. H-2/H-3/H-4/H-1 must be closed and live-verified in `miranae/orider-g1-web` before visibility changes. |
| H-2 gate | Needs backend verification | Root user PII closure and live verification are tracked in `miranae/orider-g1-web#743`; the public checklist no longer marks this done from the frontend side. |
| H-5 gate | Pass | Runtime token rotated and the production-source repository was recreated from a clean working tree instead of mirror-pushing old private history. |
| Browser security headers | Pass | Firebase Hosting now applies CSP, `X-Content-Type-Options`, `Referrer-Policy`, and COOP while preserving Firebase, App Check, Mapbox, Storage, and Sentry runtime endpoints. |
| User content URLs | Pass | User-authored post links/images and post source URLs are restricted to `http:`, `https:`, and internal relative URLs at save/render boundaries. |
| Deploy dispatch guard | Pass | Manual production deploys are job-gated to `refs/heads/main`, matching the production-source branch. |
| Creator email E2E | Pass | 2026-06-28 production E2E verified authenticated Creator Hub email-to-self delivery, callable HTTP 200, UI success state, sent-log creation, and quota decrement. Temporary App Check debug token was deleted after the test. |

## Commands

Admin/private trace scan:

```bash
rg -n "AdminPage|Admin[A-Za-z]+Page|ImpersonationBanner|impersonation|isAdmin|adminOnly|customClaims|claims\\.admin|VITE_ADMIN_ORIGIN|admin\\.orider|/admin|관리자" src shared public docs README.md CONTRIBUTING.md SECURITY.md .github -S
```

Secret-pattern scan:

```bash
rg -n "orider-strava-webhook|STRAVA_WEBHOOK_VERIFY_TOKEN|STRAVA_CLIENT_SECRET|client_secret|refresh_token|serviceAccount|private_key|-----BEGIN|AIza[0-9A-Za-z_-]{35}|pk\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+" . -S --glob '!node_modules/**' --glob '!dist/**' --glob '!package-lock.json' --glob '!docs/screenshots/*.png'
```

Tracked sensitive filename scan:

```bash
git ls-files | rg -i '(^|/)(\\.env|.*\\.env.*|.*secret.*|.*credential.*|.*service.*account.*|.*backup.*|.*dump.*|.*export.*)'
```

Verification:

```bash
npm run lint
npm test
VITE_FIREBASE_API_KEY=dummy \
VITE_FIREBASE_AUTH_DOMAIN=dummy.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=dummy \
VITE_FIREBASE_APP_ID=dummy \
npm run build
```

## Final Public Switch Notes

- The final repository has been created from a clean working tree export to avoid hidden PR refs carrying old private snapshots.
- Do not mirror-push the private repository back into this repository. A mirror can preserve hidden or deleted refs; a clean export avoids carrying old repository history into the public repo.
- Re-run the same scans from a fresh clone before changing visibility.
- Re-run build/test from a fresh clone with placeholder public config.
- Re-run a live smoke check for `https://orider.co.kr/ko/creator` and confirm Creator/API docs still match deployed behavior.
