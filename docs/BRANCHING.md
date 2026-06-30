# Branching Model

Orider Web uses a simple open-source, trunk-based model. `main` is always the protected production branch, and every change enters through a Pull Request.

```text
fork/topic branch ──┐
                    ├─ pull request ── CI/review ── squash/merge ── main ── protected deploy
maintainer/topic ───┘
```

## Rules

- `main` is protected and deploys Firebase Hosting through a protected GitHub Environment.
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

## Releases and Hotfixes

Production deploys come from `main`; there are no separate release branches for routine web releases. Urgent production fixes still use a PR:

```text
fix/production-issue -> PR -> required checks -> main -> deploy
```

If a rollback is needed, prefer a revert PR against `main` so the public history records the decision.

## Security Branches

Use `security/` only for coordinated fixes that should not expose vulnerability details in public PR text. Do not include secrets, exploit steps, private user data, or sensitive backend paths in public discussion. Report vulnerabilities through [SECURITY.md](../SECURITY.md).
