# Recipe: Weekly Load Report

## Creator Hub Summary

Turn the last 7 days of training into a premium-style workout report with KPI cards, a load chart, week-over-week change, key sessions, and next actions.

## What External Developers Build

This recipe is personal automation that runs with a rider-created Personal Data API key. It is not a server job hosted by Orider unless Orider explicitly ships an in-product version.

Recommended outputs:

- `weekly-load-report.html`: private report for the rider,
- `weekly-load-summary.json`: aggregate data for Notion, Slack, n8n, or a personal dashboard,
- `weekly-load-public-summary.txt`: public-safe summary with routes and activity names removed.

## Required Scopes

| Scope | Required | Purpose |
|---|---:|---|
| `activities:read` | Required | Recent activity list, distance, time, elevation, and TSS/load aggregation. |
| `fitness:read` | Recommended | CTL/ATL/TSB and readiness context. |
| `streams:read` | Optional | Add route thumbnails to the rider's private HTML report. |

The default report should use only `activities:read` and `fitness:read`. Route/map visuals should be added only when the rider explicitly enables them.

## Report Sections

1. Top readout
   - weekly state: `light week`, `building`, or `high load`,
   - next action: recover, hold Z2, add one focused stimulus, and so on.

2. KPI cards
   - last 7 days load,
   - load change versus the previous 7 days,
   - total distance,
   - total moving time,
   - session count and active days.

3. Charts
   - 7-day daily load bar chart,
   - distance/time/load comparison versus the previous 7 days,
   - optional CTL/ATL/TSB snapshot.

4. Key sessions
   - longest session,
   - highest-load session,
   - optional private-only map/elevation thumbnail.

5. Shareable summary
   - no exact start/end location, route geometry, activity title, or raw heart-rate/power stream,
   - example: `3 sessions · 125 km · 5 h · load 97. Check recovery before the next hard session.`

## Run The Starter Example

The starter script lives at [examples/recipes/weekly-load-report/weekly-load-report.mjs](../../examples/recipes/weekly-load-report/weekly-load-report.mjs).

```bash
ORIDER_API_KEY=orid_xxx \
ORIDER_API_BASE=https://orider.co.kr/api/v1 \
node examples/recipes/weekly-load-report/weekly-load-report.mjs
```

Outputs:

- `weekly-load-report.html`
- `weekly-load-summary.json`
- `weekly-load-public-summary.txt`

To include private mini-route visuals, create a key with `streams:read` and opt in explicitly. The example calls the route thumbnail endpoint documented in Swagger/OpenAPI and embeds the normalized SVG, not raw coordinates:

```bash
ORIDER_INCLUDE_PRIVATE_MAPS=true \
ORIDER_API_KEY=orid_xxx \
node examples/recipes/weekly-load-report/weekly-load-report.mjs
```

Use that option only for local/private HTML reports. Do not use it for community posts, team Slack channels, or public Notion pages.

## n8n Shape

1. Cron node: Monday 08:00.
2. HTTP Request node: call the activities list endpoint from Swagger/OpenAPI.
3. HTTP Request node: call the fitness summary endpoint from Swagger/OpenAPI.
4. Function node: aggregate last 7 days and previous 7 days, then build load chart data.
5. HTML or Markdown node: fill the report template.
6. Email/Notion/Slack node:
   - Email to self: private report allowed,
   - Notion: aggregate values and reflection only,
   - Slack DM: summary and next action only.

## GitHub Actions Shape

Use this only in a private repository. Never put `ORIDER_API_KEY` in a public repository.

```yaml
name: Weekly Load Report

on:
  schedule:
    - cron: "0 23 * * 0" # Monday 08:00 KST
  workflow_dispatch:

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node examples/recipes/weekly-load-report/weekly-load-report.mjs
        env:
          ORIDER_API_KEY: ${{ secrets.ORIDER_API_KEY }}
          ORIDER_API_BASE: https://orider.co.kr/api/v1
```

## Privacy Defaults

- Send aggregates first.
- Exclude activity names by default because they can reveal routines.
- Do not include route geometry, stream lat/lng, or start/end locations in public outputs.
- Use map/route thumbnails only in private reports, and remove them before sharing.
- Recurring email requires a separate opt-in, unsubscribe path, and frequency controls.

## Needs Confirmation

The OpenAPI contract does not currently guarantee a stable `mapImageUrl` or finished map image URL on the activity DTO. External developers should choose one of these paths:

- default: aggregate charts only,
- private option: call the route thumbnail endpoint documented in Swagger/OpenAPI with `streams:read` and embed the normalized SVG thumbnail,
- future API: use a documented redacted field such as `publicSafeMapThumbnailUrl` if Orider adds it later.

Do not invent endpoints or fields that are not documented in Swagger/OpenAPI.

## Review Checklist

- [ ] Required scopes are minimal.
- [ ] Public output has no route geometry or start/end location.
- [ ] API keys are absent from code, logs, screenshots, and PRs.
- [ ] Automation frequency and retry behavior are documented.
- [ ] Private report and public summary are separated.
- [ ] Map/thumbnail usage explains `streams:read` and public-sharing limits.
