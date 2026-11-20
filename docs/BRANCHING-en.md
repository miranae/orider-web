# Branching Model

Orider Web uses a simple open-source, trunk-based model. `main` is always protected, every change enters through a Pull Request, and production deploys are cut from version tags.

```text
fork/topic branch ──┐
                    ├─ pull request ── CI/review ── squash/merge ── main ── tag v* ── protected deploy
maintainer/topic ───┘
```

## Rules

- `main` is protected; merging to `main` does not deploy production automatically.
- Version tags matching `v*` deploy Firebase Hosting through a protected GitHub Environment and create GitHub Release notes.
- Direct pushes, force pushes, and branch deletion are disabled on `main`.
- Long-lived `develop`, release train, or personal integration branches are not used.
- Keep topic branches short-lived and scoped to one feature, bug, documentation update, or refactor.
- External contributors should branch from a fork. Maintainers may branch in the main repository, but still open PRs.
- Prefer squash merge for normal PRs so public history stays readable.

## Branch Names

Use lowercase, hyphen-separated names:

| Prefix | Use for | Example |
|---|---|---|
| `feat/` | User-facing features | `feat/activity-splits-chart` |
| `fix/` | Bugs and regressions | `fix/mobile-tab-overflow` |
| `hotfix/` | Urgent minimal fixes branched from `main`, allowed to target `main` directly | `hotfix/remove-app-install-banner` |
| `docs/` | Documentation and contributor setup | `docs/readme-structure` |
| `test/` | Test-only changes | `test/activity-detail-e2e` |
| `refactor/` | Internal cleanup without behavior changes | `refactor/route-hooks` |
| `ci/` | GitHub Actions and release automation | `ci/pr-only-checks` |
| `chore/` | Maintenance | `chore/update-deps` |
| `security/` | Private or coordinated security fixes | `security/harden-profile-reads` |
| `style/` | Formatting, copy style, or non-functional UI polish | `style/readme-language` |
| `perf/` | Performance-only changes | `perf/lazy-route-chunks` |
| `build/` | Build tooling and dependency plumbing | `build/vite-config` |

Good branch names describe the user or maintenance goal, not the implementation detail only.

## Contributor Flow

1. Sync with `main`.
2. Create a topic branch, for example `docs/readme-structure`.
3. Keep the PR focused and explain the review route, locale, viewport, or data state when relevant.
4. Sign commits with `git commit -s` for DCO.
5. Run the smallest relevant checks before requesting review.
6. Let CI and review finish before merge.

## Required PR Gates

Public PRs are expected to pass these required checks:

| Check | What it enforces | Notes |
|---|---|---|
| `PR metadata` | Conventional Commit-style title, maintainer branch prefix, no committed env/secret/build-output files | Fork branch names are not rejected. |
| `DCO` | Every commit has a `Signed-off-by:` line | Use `git commit -s`. |
| `CI / check` | `lint:budget`, `quality:budget`, Vitest, and production build with placeholder public config | Docs-only PRs skip npm work but still report success. |

These gates are intentionally fork-safe: they do not use repository secrets, deploy, or run privileged `pull_request_target` code.

## Maintainer Merge Flow

Maintainers should use the local merge gate instead of calling `gh pr merge` directly:

```bash
scripts/merge-pr.sh <PR_NUMBER>
```

The script runs local lint/quality/test/build checks, local AI code review, GitHub checks, and GitHub `reviewDecision` inspection before squash merging. When using `--no-review` to avoid duplicate review, follow the evidence and reuse requirements in the promotion timing policy below.

```bash
scripts/merge-pr.sh <PR_NUMBER> --no-merge
scripts/merge-pr.sh <PR_NUMBER> --require-github-review
```

For forks:

```bash
git checkout main
git pull upstream main
git checkout -b fix/mobile-tab-overflow
```

For maintainer branches in this repository:

```bash
git checkout main
git pull public main
git checkout -b docs/readme-structure
```

## Keeping Branches Current

For small contributor PRs, prefer rebasing onto current `main` before review if the branch diverges:

```bash
git fetch upstream
git rebase upstream/main
```

Use a merge commit only when the branch is large enough that preserving an integration point is clearer than rewriting local commits. Never force-push another contributor's branch without agreement.

## Main Promotion Timing Policy

1. Compare the candidate with current `main` before opening the PR. Record the changes in scope, what a failure would affect, and which checks are needed. Use the fixed snapshot flow for routine promotions and the existing isolated flow when other changes are outside the approved scope. If a preflight is needed, use a read-only check for the affected contract and check for duplication before adding it to the default deployment path.
2. Run focused local checks, then open the promotion PR to start required CI. Run independent review and validation concurrently with CI. Fix only merge-blocking review findings and record the rest. When the web merge gate confirms a successful GitHub `check` for the same head, reuse its lint, test, and build results.
3. If logs and change scope indicate a transient failure or an existing flaky test, rerun only the failed CI jobs once for the same commit. If the retry fails or the change caused the failure, diagnose it and fix the blocker. Required checks must pass before merging.
4. After the retry, reuse completed review and validation only if the full PR base and head SHAs and check inputs are unchanged. Record review scope, PASS evidence, and the successful CI run in the PR, then finish through the standard merge gate. A change to the base, head, or check inputs requires fresh evidence for the affected review and checks.
5. Record elapsed time from request to final verification and the durations of scope and preparation, review, CI including queues and retries, merge, and `dev` synchronization. Count overlapping time once in the total. When deployment is requested, record deployment preparation through live verification separately.

## Releases and Hotfixes

Production deploys come from version tags on `main`; there are no separate release branches for routine web releases. Create tags with `scripts/release-tag.sh` — it prints the full release diff (every commit since the last tag) and requires confirmation before pushing, so unreviewed changes cannot ride along with an unrelated deploy. After a successful deploy, `prod-smoke.yml` runs a mobile-viewport smoke check against production. Urgent production fixes still use a PR and a follow-up tag:

```text
fix/production-issue -> PR -> required checks -> main -> tag v* -> deploy
```

If a rollback is needed, prefer a revert PR against `main` so the public history records the decision.

## Security Branches

Use `security/` only for coordinated fixes that should not expose vulnerability details in public PR text. Do not include secrets, exploit steps, private user data, or sensitive backend paths in public discussion. Report vulnerabilities through [SECURITY.md](../SECURITY-en.md).

### CodeQL merge policy

CodeQL scanning stays enabled but is non-blocking in `scripts/merge-pr.sh`. Only checks identified through GitHub’s official app and a matching head/check-suite CodeQL workflow are excluded. Other failed or unknown checks, conflicts, protection rules, and head changes still block merging. The default waits for ordinary checks; `--no-wait` still rejects pending ordinary checks.
