# Creator Showcase

GitHub is only the contribution pipe. The rider-facing value needs to live inside Orider: people should be able to discover what others built with their own data, try safe recipes, and share privacy-safe results.

This document defines the product direction for an Orider Creator Showcase.

## Product Goal

Make personal-data creations visible and reusable without exposing private activity data.

The intended loop:

1. A rider connects or exports their own Orider data.
2. They build a chart, AI diary, report, alert, widget, or automation.
3. They publish a recipe, showcase card, or share link.
4. Other riders can understand what it does, what data it needs, and how to try it safely.

## Surfaces

| Surface | Audience | Purpose |
|---|---|---|
| Creator Hub | Riders and developers | Discover recipes, apps, cards, and examples built with personal Orider data. |
| Recipe Page | Builders | Explain how a creation works, required scopes, setup, privacy notes, and example output. |
| Showcase Card | Riders | Share a result without exposing raw private data. |
| Public Share Link | Riders | Optional link-only or public page for selected outputs. |
| Community Post Composer | Riders | Turn an output into an editable Orider post. |
| Email-to-self | Riders | Send reviewed recipe results to the signed-in rider's own verified email. |
| Developer Profile | Builders | Show who built the recipe/app and where to follow or report issues. |

## Creation Types

| Type | Example | Sharing mode |
|---|---|---|
| Chart | Weekly load, FTP trend, zone-time tracker | Screenshot/card, public-safe chart, recipe |
| AI diary | Weekly ride diary, race-prep reflection, recovery note | Private by default, optional redacted share card |
| Alert | Hard-day streak warning, missed Z2 target, event-prep reminder | Recipe, notification preview |
| Report | Monthly training summary, coach-ready recap | PDF/markdown export, link-only page |
| Widget | Recent ride card for a personal site | Embeddable public-safe card |
| Automation | Notion log, Google Sheets sync, Discord reminder | Recipe plus setup checklist |

## Flagship Recipes

Creator Hub should lead with five complete recipes:

| Recipe | Result | Delivery |
|---|---|---|
| AI ride diary | Private diary draft and redacted card. | Orider AI credit, share card, email-to-self. |
| Weekly load report | 12-week load chart and weekly training digest. | Dashboard card, share card, email-to-self. |
| Hard-day streak alert | Recovery warning when hard days stack up. | In-app alert direction, email-to-self, future opt-in recurring alert. |
| Long-ride log package | GPX/private export path and coach-ready markdown checklist. | Private download, Notion-ready notes, email-to-self summary. |
| Monthly ride badge | Public-safe monthly progress badge. | Public-safe widget/card, email-to-self preview. |

Email delivery is limited to the signed-in rider's own verified email and should not support arbitrary recipients.

Production status:

- Creator Hub renders the five flagship recipes from metadata.
- Reviewed flagship recipes can trigger email-to-self delivery.
- The email callable requires Firebase Auth and App Check.
- Delivery is rate-limited to 5 creator recipe emails per rider per day.
- Sent-email logs record recipe, masked recipient, language, timestamp, and quota state.
- Production E2E on 2026-06-28 verified authenticated UI delivery, callable success, success-state rendering, sent-log creation, and quota decrement.

## AI Ride Diary Example

An AI ride diary should be private by default because it can reveal location, routine, fitness, fatigue, injury risk, and social patterns.

Orider should provide a built-in generation path:

- no provider API key is exposed to the browser or to plugins,
- Orider calls the AI provider server-side,
- each rider gets **5 diary generations per day**,
- App Check, Auth, server-side rate limits, and audit logs protect the endpoint,
- generated drafts are private until the rider chooses a share mode.

Safe sharing options:

| Mode | What gets shared |
|---|---|
| Private draft | Full diary visible only to the rider. |
| Redacted card | Summary, aggregate stats, selected sentence, no exact route or start location. |
| Link-only diary | Rider-selected text and charts behind an unlisted URL. |
| Community post | Editable copy that the rider explicitly posts to Orider community. |
| Recipe | How the diary was generated, with demo data only. |

Minimum controls:

- before/after redaction preview,
- remove exact location toggle,
- remove health metrics toggle,
- remove names/group references toggle,
- visibility selector: `private`, `link-only`, `public`, `community post`,
- report/abuse path for public outputs.

## Discovery Model

Creator Hub should not be a free-for-all plugin marketplace at first. Start with a curated showcase:

1. **Featured**: maintainer-reviewed recipes and cards.
2. **Community Recipes**: markdown-backed recipes from the public repository.
3. **Built by Riders**: user-submitted examples with screenshots or demo outputs.
4. **API-backed Recipes**: examples that use the owner-only Personal Data API or wait for additional scopes.

This keeps quality high while the API and consent model mature.

## App And Plugin Direction

Long term, Orider can support connected apps or plugins. The first version should be conservative:

| Stage | Capability |
|---|---|
| Recipe | Static instructions, demo data, no token exchange. |
| Local tool | User runs or hosts it themselves with their own token. |
| Registered app | App has a developer profile, redirect URI, scopes, rate limits, and review status. |
| In-product plugin | Runs inside Orider with strict sandboxing, reviewed permissions, and revocation. |

Do not let arbitrary third-party code run inside Orider until sandboxing, review, permission prompts, abuse handling, and token isolation are designed.

## Data And Consent

Every showcase item should state:

- what data it uses,
- required scopes,
- whether data leaves Orider,
- whether output can reveal location, health, routine, or social relationships,
- default visibility,
- deletion/revocation path.

Recommended labels:

- `Own data only`
- `Read-only`
- `Uses location`
- `Uses health metrics`
- `Sends data outside Orider`
- `Public-safe output`
- `Maintainer reviewed`

## Public Repository Role

The repository should be the source for:

- recipe markdown,
- sample/demo outputs,
- public API contracts and sample responses,
- reusable utilities,
- review checklist,
- showcase contribution templates.

The Orider product should be the user-facing distribution surface:

- browse,
- try,
- save,
- share,
- report,
- revoke.

## MVP Checklist

- [x] Add Creator Hub route in Orider.
- [x] Show curated recipe cards sourced from recipe metadata.
- [x] Add an AI ride diary showcase example with demo data and a protected callable path.
- [x] Add a weekly load chart example that uses owned activity data when signed in and demo data otherwise.
- [x] Add privacy labels to every card.
- [x] Add "Submit a recipe" link to GitHub for developers.
- [x] Add "Request this integration" issue link for non-developers.
- [x] Add share-card spec for redacted rider outputs.
- [x] Add a report path for showcase cards.
- [x] Add moderation intake and admin review queue for showcase reports.
- [x] Add email-to-self delivery for reviewed flagship recipes.
- [x] Verify production email-to-self delivery through authenticated Creator Hub E2E.

Remaining product work:

- Add recurring opt-in scheduling for email digests and alerts.
- Add developer profiles, featured creator placement, and install/use counts.
- Expand the Personal Data API beyond the current owner-only read foundation before advertising third-party automation as broadly live.
