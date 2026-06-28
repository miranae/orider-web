# Governance

This repository is maintained as the public frontend source of truth for Orider Web.

The governance goal is simple: keep Orider useful to riders, hard to privatize into a closed product, and careful with personal ride data.

## Project Stewardship

Maintainers are stewards, not private owners of the community-built core. Maintainers review PRs, protect production deploys, and keep the project aligned with [MISSION.md](MISSION-en.md).

Current protected assets:

- The AGPL-licensed source code in this repository.
- The public contribution history.
- The Orider name and logo, managed separately under [TRADEMARK.md](TRADEMARK-en.md).
- Production infrastructure, credentials, and private user data, which are not part of the public repository.

## Decisions That Need Public Review

The following changes require a public proposal before they can be accepted:

- Changing the repository license.
- Moving the public repository to a more restrictive model.
- Removing AGPL/copyleft protections from core code.
- Changing DCO-based contribution rules.
- Changing the trademark policy in a way that could mislead users about official Orider services.
- Introducing funding or sponsorship terms that restrict community access to the open core.

For these changes, maintainers should open an issue or discussion-style PR, leave it open for at least 14 days when practical, and document the final decision in the repository.

## License Changes

Orider Web is licensed under GNU AGPL-3.0. The license is intentionally chosen to discourage closed SaaS forks of the web frontend.

Future relicensing should require broad maintainer agreement and should not remove rights from existing contributors. Contributions are accepted under the repository license using the DCO process, not through a broad copyright assignment.

## Maintainer Rules

- `main` stays protected.
- Direct pushes to `main` stay disabled.
- Production deploys stay behind protected GitHub Environments.
- Security-sensitive details are handled through [SECURITY.md](SECURITY-en.md), not public issues.
- Maintainers should avoid merging large, unrelated changes.

## Community Participation

Not every contribution needs code. Useful participation includes:

- Bug reports with safe reproduction details.
- Copy, terminology, and manual improvements.
- Accessibility and mobile layout fixes.
- Personal-data recipes using owned or demo data.
- Review of confusing screens and rider workflows.

## Private Data Boundary

The public project can explain, test, and improve the user experience around ride data. It must not expose production user data, precise private routes, credentials, service accounts, or operational logs.

This boundary exists to protect riders while keeping the product experience open to improvement.
