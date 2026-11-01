# Issue 1400 local review

Worktree: `feat/1400-common-onboarding`, based on `origin/dev`.

Open `http://127.0.0.1:5180/ko/coach/goals?sport=bike&start=choose`.
Switch between cycling and running in the existing goal hub. The local review supports
preview, synthetic sign-in, authenticated reservation, the existing plan/today routes,
date changes, refresh recovery and cancellation. It does not start an actual workout.

## Local startup

Install the lockfile dependencies with `npm ci`. Start isolated demo emulators:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home \
PATH=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home/bin:$PATH \
firebase emulators:start --config e2e/onboarding-local.emulators.json \
  --project demo-orider-onboarding --only auth,firestore
```

In a second terminal seed the synthetic account, then start the review server:

```sh
node scripts/seed-onboarding-local.mjs
VITE_FIRST_WORKOUT_LOCAL_PREVIEW=true \
VITE_USE_EMULATORS=true \
VITE_FIREBASE_PROJECT_ID=demo-orider-onboarding \
VITE_FIREBASE_API_KEY=fake-local-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-orider-onboarding.firebaseapp.com \
VITE_FIREBASE_STORAGE_BUCKET=demo-orider-onboarding.appspot.com \
VITE_FIREBASE_APP_ID=1:123:web:onboarding \
VITE_AUTH_EMULATOR_PORT=19299 \
VITE_FIRESTORE_EMULATOR_PORT=18280 \
VITE_FUNCTIONS_EMULATOR_PORT=15299 \
VITE_STORAGE_EMULATOR_PORT=19298 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19299 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:18280 \
ORIDER_VITE_CACHE_DIR=/tmp/orider-1400-vite-cache \
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
```

The dev middleware pins runtime config to the synthetic demo project. The local login
uses a public synthetic account on the Auth emulator, with in-memory Firebase persistence.
A tab-local opt-in restores that synthetic session after refresh. Logging out clears it.
The review never uses production accounts or writes to production Firebase.

The middleware verifies emulator identity tokens, rejects foreign origins, validates
dates, uses Firestore transactions for concurrent idempotency and revision checks,
and blocks an existing active goal or another sport's reservation. An expired date is
not completion. The service exposes no automatic completion or record matching.
Browser writes to Firestore are disabled in the local review rules; the middleware
uses the emulator Admin SDK.

## Verification

```sh
node scripts/test-onboarding-local.mjs
npm run test:vitest -- src/features/training/start src/pages/GoalHub.test.tsx \
  src/components/dashboard/RunEmptyState.test.tsx src/pages/OnboardingPage.test.tsx \
  src/pages/OnboardingPage.goalHandoff.test.tsx src/contexts/AuthContext.test.tsx
npm run lint:budget
npm run quality:budget
npx tsc -b --pretty false
VITE_ORIDER_AI_API_BASE=http://127.0.0.1:5180 npm run build
```

The local API script creates only synthetic emulator accounts and fixtures. It checks
authentication, origin, invalid input, concurrent retries, account separation,
cross-sport and active-goal conflicts, stale revisions, date changes, cancellation and
rebooking. Browser review covers cycling and running, guest preview, synthetic login,
save-to-plan, rescheduling, refresh recovery and a 393px mobile viewport.

## Remaining before production

- The first workout content and durations are provisional local examples, explicitly
  labelled. They need content review and a beginner pilot.
- Reservation is deliberately available only with a dev build, loopback origin,
  explicit opt-in and the exact isolated demo project. There is no production callable
  or production Firestore rules change in this worktree.
- A production server contract, record selection/matching and actual app execution
  support remain to be implemented and verified. Issue 1400 is not complete.
- Existing Run30 and ordinary goal creation remain their existing server paths; their
  callable backends are not included in the isolated review emulators. Do not interpret
  their local API errors as a production availability check.
- No PR, merge or deployment has been performed.
