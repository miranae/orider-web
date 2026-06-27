# Security Re-audit Snapshot - 2026-06-27

Scope: public-release candidate surface for `miranae/orider-web`.

This is a pre-publication re-audit of the frontend repository surface. It does not replace the final audit that should run after the clean public repository is created.

## Summary

| Area | Result | Notes |
|---|---|---|
| Admin/private feature traces | Pass | No source or public docs matches for admin routes, impersonation pages, admin origin env, admin claims, or admin-only UI. |
| Secret-like strings | Pass with expected false positives | No Strava webhook token, client secret, private key, service account, Firebase real API key, or Mapbox token was found. Matches are public docs, test fixture passwords, runtime ID-token variables, export helpers, and design-token wording. |
| Tracked env files | Pass | `.env.e2e` contains fake emulator values only. `.env.example` contains placeholders only. `.env` and local variants are ignored. |
| Tests | Pass | `npm test`: 62 files, 551 tests passed. Existing jsdom Mapbox/WebGL warnings only. |
| Lint | Pass with warnings | `npm run lint`: 0 errors, existing design-system/no-console warnings only. |
| Build | Pass | `npm run build` passed with dummy public Firebase config. Existing CSS wildcard/chunk-size warnings only. |
| H-2 gate | Pass | Production backend migration/backfill/scrub completed outside this repo; public checklist reflects completion. |
| H-5 gate | Not final | Runtime token rotated and heads/tags purged outside this repo. GitHub hidden `refs/pull/*` remains a final-publication blocker until a clean repository is created or GitHub Support purges hidden PR refs. |
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

- Create the final public repository from a clean working tree export to avoid GitHub hidden PR refs carrying old private snapshots.
- Do not mirror-push the private repository. A mirror can preserve hidden or deleted refs; a clean export avoids carrying old repository history into the public repo.
- Re-run the same scans on the newly created repository before changing visibility.
- Re-run build/test from a fresh clone with placeholder public config.
- Re-run a live smoke check for `https://orider.co.kr/ko/creator` and confirm Creator/API docs still match deployed behavior.
