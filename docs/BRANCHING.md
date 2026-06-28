# Branching Model

Orider Web uses a simple open-source branching model:

- `main` is the protected production branch.
- All changes go through Pull Requests.
- Feature work uses short-lived topic branches.
- Long-lived `develop` branches are not used.

## Branch Names

Use one of these prefixes:

| Prefix | Use for | Example |
|---|---|---|
| `feat/` | User-facing features | `feat/activity-splits-chart` |
| `fix/` | Bugs and regressions | `fix/mobile-tab-overflow` |
| `docs/` | Documentation and contributor setup | `docs/public-release-prep` |
| `test/` | Test-only changes | `test/activity-detail-e2e` |
| `refactor/` | Internal cleanup without behavior changes | `refactor/route-hooks` |
| `ci/` | GitHub Actions and release automation | `ci/pr-only-checks` |
| `chore/` | Maintenance | `chore/update-deps` |
| `security/` | Private or coordinated security fixes | `security/harden-user-profile-reads` |

Keep branch names lowercase and descriptive. Prefer hyphens over underscores.

## Pull Request Flow

1. Branch from latest `main`.
2. Keep the change focused.
3. Open a PR early if backend, privacy, or design scope is uncertain.
4. Sign commits with `git commit -s` for DCO.
5. Wait for CI.
6. Merge only after required checks pass.

`main` is protected with required Pull Requests and admin enforcement. Direct pushes, force pushes, and deletion are disabled.

## Public Release Work

Public-release preparation should use `docs/`, `ci/`, `fix/`, or `security/` branches depending on the nature of the work.

Current public-release blockers are tracked in [PUBLIC_RELEASE_CHECKLIST.md](PUBLIC_RELEASE_CHECKLIST.md).

## Security Branches

Use `security/` branches only for coordinated fixes that do not expose vulnerability details in public PR text. Report vulnerabilities through [SECURITY.md](../SECURITY.md).
