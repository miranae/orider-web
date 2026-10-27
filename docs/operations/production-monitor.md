# Production feed monitoring

The checker reads anonymous Korean and English home pages in separate Chromium
contexts. It does not write production data or deploy code. A visible activity
link is required for a populated feed. A normal empty state requires both the
explicit empty UI and a successful, exhausted discovery response matching the
empty contract. A shell, HTTP 200, malformed/error response, loading timeout,
main-application console API error, page exception or failed script cannot count as success.
The legacy Firestore transport does not have a verified empty contract here;
an empty legacy feed fails closed as `unverified_empty`, rather than concealing
an outage. The local fixture check proves valid empty versus HTTP-200 error
handling; it does not assert production currently has no activities.

## Results and the existing user notification path

`node scripts/production-monitor.mjs` writes a timestamped `result.json`, per-locale
console/network summaries, and masked failure screenshots under
`production-monitor-results/`. `latest.json` is atomically replaced after a real
run. Set `MONITOR_RESULT_DIR` to keep this path stable outside a checkout.
Each result includes observed times, live entry asset and SHA-256, locale/card
counts and classified status. These are observations of the served artifact,
not the monitor checkout SHA. External reCAPTCHA-frame console diagnostics are retained
but do not by themselves prove a feed API failure; actual App Check HTTP failures
are classified as API errors. `runnerError` identifies monitor infrastructure
failure rather than asserting a site outage. `MONITOR_RESOLVE_HOSTING=true` optionally reads the
Hosting release/version using the operator's existing gcloud identity; it creates
no credential and persists no token. CI has no new cloud permission and identifies
the actual live bundle by its asset and digest; `hostingVersion` can be null.

On M4 the parent task reads:

```
cat /Users/kyoungnam/Documents/Codex/2026-10-27/task/production-monitor-results/latest.json
```

A fresh M4 read-only check (use the installed isolated Chromium; no app/server restart):

```sh
MONITOR_RESULT_DIR=/Users/kyoungnam/Documents/Codex/2026-10-27/task/production-monitor-results \
MONITOR_RESOLVE_HOSTING=true \
MONITOR_CHROMIUM_PATH=/Users/kyoungnam/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell \
node /Users/kyoungnam/work/moon/_worktrees/orider-production-monitor-20261027/scripts/production-monitor.mjs
```

The existing parent hourly automation owns user delivery and suppresses repeated
healthy notices. Compare `completedAt`, `simulation`, `status` and live digest;
a stale/missing result is not evidence of current health. Do not start another
check if a fresh result exists for the period. No new recipient, webhook, secret,
subscription or IAM grant is introduced. GitHub workflow failure supplies the
existing Actions failure signal, not a newly configured external notification.
A parent must read results and deduplicate incident/recovery transitions.

CI uploads `production-monitor-RUN_ID-ATTEMPT` artifacts from each repository.
The parent can inspect the latest completed `prod-smoke.yml` run in orider-web,
or `production-web-monitor.yml` in orider-g1-web, then download that **exact** run:

```sh
gh run list --repo miranae/orider-web --workflow prod-smoke.yml --limit 5 \
  --json databaseId,conclusion,status,createdAt,url
gh run download RUN_ID --repo miranae/orider-web \
  --name production-monitor-RUN_ID-ATTEMPT --dir /tmp/orider-monitor-RUN_ID
```

Never substitute the latest successful run for a newer failed run. Check artifact
`completedAt` as well as workflow conclusion; install/source-validation failures
may have no checker result and still mean the monitor failed. Do not assume the
local `latest.json` synchronizes CI artifacts automatically.

## Hourly and deployment triggers

`prod-smoke.yml` schedules one read every hour at minute 17 UTC. GitHub scheduled
runs are best effort and can be delayed. The schedule becomes active only when
the workflow is on the default branch and Actions is enabled; a draft/dev merge
alone is not activation and does not deploy Hosting.

A successful production Hosting workflow triggers the same checker. The reusable
workflow resolves the **deploy job's** successful `completed_at` through GitHub,
then waits until that timestamp plus 300 seconds, including setup time already
elapsed. A late runner starts immediately and its actual observation time remains
in the result. Only the known production workflow, a successful `v*` push and a
successful deploy job qualify. A dev merge, stage/rehearsal run, skipped deploy or
failed run is rejected. No code from the just-deployed commit is executed by
`workflow_run`; the trusted monitor ref is used.

The backend companion workflow listens to successful `Deploy` tag runs and
`Production backend fast deploy` dispatches. Its immutable public-web workflow
and monitor-code refs are pinned to the reviewed monitor commit. It verifies the
actual successful `Build & Deploy to Firebase` or `Execute bounded production plan`
job and waits from that job's completion. It reads the live site in the same
repository job without a cross-repository dispatch credential. These checks can
include backend changes beyond the home feed; there are no dev-merge triggers.
Both PRs must be merged/promoted for their automatic triggers to exist. No live
release was performed to test this wiring; existing real success records plus
clock/negative regressions validate the selector and deadline. First automatic
post-deployment execution remains to be observed after activation.

## Validation and safe failure drills

```
node --test scripts/production-monitor.test.mjs
node scripts/production-monitor-fixture-check.mjs
```

The second command starts its own ephemeral loopback server and runs the actual
checker against valid empty and error-envelope fixtures in both locales. It
never changes the live feed. On M4 set `MONITOR_CHROMIUM_PATH` as above.
`MONITOR_SIMULATE=api` or `chunk` aborts requests only inside the new checker
browser. Store drills in a separate `MONITOR_RESULT_DIR`. Simulation runs write
`latest-simulation.json`, never the real `latest.json`, and must never notify the
user as a production incident. Raw HAR/traces, account state, response bodies,
rider text, query strings and credentials are not saved. Rider articles are
masked in screenshots; existing viewport smoke tracing/screenshots are disabled
to avoid publishing unmasked content as public-repository artifacts.

## Recovery order

Use [the verified 2026-10-27 Hosting recovery record](2026-10-27-public-feed-recovery.md).
Preserve time, live release/version, entry digest and failure evidence first;
then follow the existing authorized operator rollback procedure to a previously
verified finalized Hosting artifact. Confirm that the current incident is in the
web artifact before choosing that recovery; a backend failure needs its existing
backend recovery procedure. The 2026-10-27 successful target was Hosting version
`15a2e4c911516145`, web `429c06a0`, release `1793066989897000`. Revalidate the target
and intervening changes each time instead of treating this historical ID as a
permanent automatic target. Verify anonymous Korean and English cards afterward,
then report recovery and evidence to the user. Do not redeploy the missing API,
release incompatible web code, change App Check/rules, or add automatic rollback
as a monitoring side effect. This PR adds no recovery mutation command.
