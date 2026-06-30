# Public Repository Cutover

This runbook is for the final move from the private release-candidate repository to a public repository with clean history.

The goal is not only to remove sensitive history. The public repository should also open with a coherent product story, safe contributor paths, and no misleading promise that the private backend is included.

## Preferred Approach

Use a clean working tree export, not a git mirror.

A mirror push preserves commits, tags, deleted refs, and hidden pull-request snapshots that may contain old private material. A clean export starts the public repository with one initial commit containing only the intended files.

Recommended flow:

1. Start from a fresh clone of the private source repository.
2. Check out the exact reviewed commit.
3. Confirm the worktree is clean.
4. Export tracked files from that commit.
5. Copy only intended public files into a new empty repository.
6. Run the final scans in the new repository.
7. Create the first public commit.
8. Push to the new public repository.
9. Enable branch protection, required CI, and the protected `production` environment before accepting external PRs.

Example export:

```bash
git archive --format=tar HEAD | tar -x -C ../orider-web-public
```

Do not copy `.git/`, local `.env` files, build caches, local screenshots, production exports, service-account files, or any temporary E2E/debug-token artifacts.

## Files That Should Be Present

The public repository should include:

- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `LICENSE`
- `TRADEMARK.md`
- `.github/` issue, PR, CI, and deploy templates
- `src/`, `shared/`, `public/`, `docs/`, `manual-src/`, `e2e/`, `scripts/`
- Vite, TypeScript, ESLint, Vitest, Playwright, Firebase Hosting, and package metadata
- verified current-product screenshots under `docs/screenshots/`, if available

The public repository should not include:

- old git history,
- hidden `refs/pull/*` snapshots,
- Cloud Functions source,
- production Firestore or Storage rules,
- service accounts,
- provider secrets,
- production data exports,
- private backend deploy scripts,
- local debug tokens,
- real user data, production screenshots, or static demo illustrations presented as product screenshots.

## Final Scans

Run these from the new repository before changing visibility:

```bash
rg -n "AdminPage|Admin[A-Za-z]+Page|isAdmin|adminOnly|customClaims|claims\\.admin|VITE_ADMIN_ORIGIN|admin\\.orider|/admin|관리자" src shared public docs README.md CONTRIBUTING.md SECURITY.md .github -S \
  --glob '!docs/SECURITY_REAUDIT_*.md' \
  --glob '!docs/PUBLIC_REPOSITORY_CUTOVER.md'
```

```bash
rg -n "orider-strava-webhook|STRAVA_WEBHOOK_VERIFY_TOKEN|STRAVA_CLIENT_SECRET|client_secret|refresh_token|serviceAccount|private_key|-----BEGIN|AIza[0-9A-Za-z_-]{35}|pk\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+" . -S \
  --glob '!node_modules/**' \
  --glob '!dist/**' \
  --glob '!package-lock.json' \
  --glob '!docs/screenshots/*.png' \
  --glob '!docs/SECURITY_REAUDIT_*.md' \
  --glob '!docs/PUBLIC_REPOSITORY_CUTOVER.md'
```

```bash
git ls-files | rg -i '(^|/)(\\.env|.*\\.env.*|.*secret.*|.*credential.*|.*service.*account.*|.*backup.*|.*dump.*|.*export.*)'
```

Expected tracked-env result:

- `.env.example`
- `.env.e2e`

Both must contain placeholders or emulator-only values.

## Build Checks

Run at least:

```bash
npm ci
npm run lint
npm test
VITE_FIREBASE_API_KEY=dummy \
VITE_FIREBASE_AUTH_DOMAIN=dummy.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=dummy \
VITE_FIREBASE_APP_ID=dummy \
npm run build
```

Then run a smoke check against the live product:

```bash
curl -I https://orider.co.kr/ko/creator
```

## Public Repository Settings

Set or verify repository metadata:

- description: `Ride analysis, group events, route discovery, and training dashboards for Orider`
- website: `https://orider.co.kr`
- topics: `cycling`, `fitness`, `react`, `vite`, `firebase`, `typescript`, `open-source`, `sports-analytics`

Enable:

- branch protection for `main`,
- required PR reviews,
- required CI checks,
- blocked force pushes and branch deletion,
- protected `production` environment with maintainer approval.

## Final Human Review Before Visibility Changes

Before flipping visibility:

- README first screen shows product value, live app, screenshots, and contribution paths.
- API docs state the owner-only Personal Data API clearly.
- Creator docs explain recipes, email-to-self, privacy defaults, and remaining limits.
- Development docs are honest about private backend limits.
- Security docs tell people not to file vulnerabilities publicly.
- Public release checklist has no open blocker except items intentionally handled after the new repository exists.
