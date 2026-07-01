# Personal Data API

Orider's public developer direction is personal data access: riders should be able to use their own Orider data in their own dashboards, notebooks, alerts, and automation.

This is a product direction with a small live foundation. The current API supports owner-only read access for selected personal data and scoped developer API keys, while the broader third-party app platform remains early.

## Why This Matters

Riders already build personal systems around training data: spreadsheets, Notion pages, Discord alerts, custom dashboards, coach reports, and AI summaries. Orider should make that easier without exposing other users' data or turning internal Firebase callables into an unsupported scraping surface.

The intended model is:

> A signed-in rider can grant a token limited to their own Orider data, then use that data in personal tools and share recipes with the community.

GitHub is only the developer contribution channel. The rider-facing discovery and sharing surface should be Orider's Creator Showcase: a place to browse personal-data recipes, try reviewed ideas, and share privacy-safe result cards. See [Creator Showcase](CREATOR_SHOWCASE-en.md).

## What Developers Could Build

| Use case | Example |
|---|---|
| Personal dashboards | Weekly load, FTP trend, zone time, monthly distance, elevation, and recovery state. |
| Alerts and automation | Rest-day warnings, missed Z2 targets, high-intensity streak alerts, event-prep reminders. |
| Reports | Weekly training reports, monthly progress summaries, race-prep notes, coach-ready exports. |
| External sync | Google Sheets, Notion, personal websites, Slack, Discord, or internal club tools. |
| AI workflows | Summarize the last 4 weeks, explain fatigue signals, draft next-week training notes. |

## Orider-Managed Email Delivery

Representative Creator Hub recipes can send an immediate result email to the signed-in rider's own verified account email. This is meant for personal digests and alerts, not arbitrary outbound messaging.

Current safety model:

- no custom recipient address,
- explicit user action from Creator Hub,
- server-side Gmail/nodemailer secrets only,
- App Check and Firebase Auth required,
- 5 creator recipe emails per rider per day,
- audit logs for sent recipe emails,
- exact route geometry and raw sensitive streams excluded from email bodies.

Production E2E on 2026-06-28 verified the email-to-self path with an authenticated maintainer-controlled session: App Check token exchange, callable HTTP 200, Creator Hub success state, Firestore sent-log creation, and per-rider quota decrement.

Recurring email alerts are intentionally separate from immediate email-to-self. A recurring digest or alert needs explicit opt-in, unsubscribe controls, quiet hours or frequency settings, and abuse monitoring.

## Minimum Live API

The first live surface is intentionally small:

| Endpoint | Scope | Status |
|---|---|---|
| `POST /api/v1/developer/api-keys` | Firebase Auth bearer | Live key issuance |
| `GET /api/v1/developer/api-keys` | Firebase Auth bearer | Live key list |
| `DELETE /api/v1/developer/api-keys/{keyId}` | Firebase Auth bearer | Live key revocation |
| `GET /api/v1/me` | `profile:read` | Live owner-only read |
| `GET /api/v1/activities` | `activities:read` | Live owner-only read |
| `GET /api/v1/activities/{activityId}` | `activities:read` | Live owner-only read |
| `GET /api/v1/activities/{activityId}/streams` | `streams:read` | Live owner-only read |
| `GET /api/v1/fitness/summary` | `fitness:read` | Live owner-only read |

Use `X-API-Key: orid_...` for personal API keys. Keys are created from an authenticated Orider account, scoped, rate-limited, and revocable. In the product, go to **Settings → Developer API** to create, copy, and revoke keys.

## Builder Path

Use this path:

1. Start with a recipe that uses live owner-only endpoints, sample JSON, exported files, or mocked responses.
2. State the required scopes, privacy notes, polling interval, and shareable output.
3. Submit the recipe through GitHub or request it from Creator Hub.
4. Maintainers review the recipe for privacy, product fit, and abuse risk.
5. Reviewed recipes can appear in Creator Hub as cards, demo outputs, or in-product examples.
6. If an endpoint is not live yet, keep the recipe mock-backed until the required scope is added.

This keeps the public release useful without encouraging developers to scrape internal Firebase callable endpoints.

## Orider AI Credits

Orider can provide AI-powered personal-data features without exposing provider API keys.

The intended model:

- Orider keeps AI provider keys server-side in Secret Manager.
- Riders call authenticated Orider endpoints for approved recipes.
- The server redacts sensitive inputs before model calls.
- Each recipe gets a small per-rider quota and returns private-first results.
- The current reference implementation is `generateAiDiary`, which provides **5 AI diary generations per rider per day**.
- The full AI diary is private by default.
- The share card is redacted by default.
- Advanced external automation can still use a rider's own AI provider key outside Orider.

Do not put OpenAI, Anthropic, Gemini, or other provider API keys in browser code, recipes, screenshots, or public repositories.

## First Public Scope

The first version should be read-only and limited to the authenticated rider's own data.

Candidate scopes:

| Scope | Allows |
|---|---|
| `profile:read` | Read the rider's basic profile and public-safe account metadata. |
| `activities:read` | List and read the rider's own activities. |
| `streams:read` | Read stream data for activities the rider owns. |
| `fitness:read` | Read the rider's training load, fitness, readiness, and summary snapshots. |
| `exports:read` | Generate or retrieve export formats for owned activities. |

Not in the first version:

- write access,
- deleting or editing activities,
- reading friends' private activities,
- club/member administration,
- raw provider tokens,
- backend job control,
- service account access.

## API Endpoints

These endpoint shapes are intentionally small. They are the first public contract; Firebase callable names and Firestore documents remain internal implementation details.

| Endpoint | Scope | Purpose |
|---|---|---|
| `GET /api/v1/me` | `profile:read` | Basic signed-in rider profile. |
| `GET /api/v1/activities` | `activities:read` | Activity list for the token owner. |
| `GET /api/v1/activities/{activityId}` | `activities:read` | Activity detail if owned by the token owner. |
| `GET /api/v1/activities/{activityId}/streams` | `streams:read` | Stream arrays for an owned activity. |
| `GET /api/v1/fitness/summary` | `fitness:read` | Current training load and summary metrics. |

## Response Shapes

Activity responses should prefer public-safe, documented fields over raw Firestore documents.

```json
{
  "id": "act_123",
  "type": "Ride",
  "startTime": "2026-06-28T07:30:00.000Z",
  "distanceMeters": 42195,
  "movingTimeSeconds": 5820,
  "elevationGainMeters": 610,
  "averageSpeedKph": 26.1,
  "averageHeartRate": 148,
  "averagePower": 202,
  "normalizedPower": 229,
  "tss": 86,
  "visibility": "private"
}
```

Stream responses should be explicit about units and array alignment.

```json
{
  "activityId": "act_123",
  "timeSeconds": [0, 1, 2],
  "latlng": [[37.5665, 126.9780]],
  "altitudeMeters": [35],
  "heartRateBpm": [145],
  "powerWatts": [210],
  "cadenceRpm": [88]
}
```

## Security Requirements

A Personal Data API must have server-side enforcement. Frontend checks are only user experience, not authorization.

Minimum requirements:

- token issuance from an authenticated Orider account,
- explicit scopes and token revocation,
- owner-only access checks on every request,
- rate limits per token and per user,
- audit logs for token creation, use, and revocation,
- no provider secrets or raw OAuth refresh tokens in responses,
- private activity visibility respected by default,
- safe error responses that do not reveal whether another user's resource exists.

## Recipe Sharing

The public repository should make personal-data recipes easy to propose even before the stable API exists. Orider should make those recipes discoverable inside the product through Creator Hub or a similar showcase surface.

Good recipes:

- use only the signed-in rider's own data,
- include required scopes,
- avoid long-lived secrets in frontend code,
- describe expected rate and polling interval,
- include privacy notes,
- include a screenshot, chart, or example output when possible.

Recommended recipe ideas:

- "Send my weekly load summary to Discord."
- "Build a personal CTL/ATL/TSB chart."
- "Export my latest ride to GPX and attach it to a training log."
- "Create a Notion page for every long ride."
- "Warn me when three hard days happen back to back."
- "Email my weekly load report to myself every Monday after I opt in."

See [Personal Data Recipes](recipes/personal-data-en.md) for contributor-facing templates. Use [Report Recipe Template](recipes/report-template-en.md) for premium-style analysis reports, and see the runnable [Weekly Load Report example](../examples/recipes/weekly-load-report).

## Result Sharing

Recipes explain how something was built. Result sharing lets a rider show what they made.

Supported result-sharing direction:

| Result | Safe default |
|---|---|
| AI ride diary | Private draft, then optional redacted card or link-only page. |
| Weekly load chart | Aggregate chart with no precise route or start location. |
| Recovery alert | Private notification preview or anonymized recipe screenshot. |
| Personal website widget | Public-safe recent ride summary chosen by the rider. |
| Coach report | Exportable private report, not public by default. |

Every shared result should have explicit visibility and redaction controls before publication.
