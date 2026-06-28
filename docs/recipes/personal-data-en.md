# Personal Data Recipes

Personal data recipes show how a rider could use their own Orider data for charts, reports, alerts, exports, or automation.

The Personal Data API now has a small owner-only read foundation. Recipes in this directory should use live endpoints when possible, and fall back to sample JSON, exported data, or mocked responses when a needed scope is not available yet.

GitHub is the authoring and review workflow. The intended rider-facing surface is Orider Creator Hub, where recipes can be browsed, tried, saved, and paired with privacy-safe result cards. See [Creator Showcase](../CREATOR_SHOWCASE-en.md).

## Fastest Way To Start

You can use a scoped Personal Data API key for the live owner-only endpoints, but you do not need one to propose a useful recipe.

1. Pick a rider outcome: chart, alert, report, export, AI summary, widget, or automation.
2. Use demo JSON, exported files, or mocked responses.
3. Document the scopes and privacy behavior.
4. Include a result card or screenshot that can be shown in Creator Hub.
5. Open a PR, or ask for the recipe from the Creator Hub request link.

The first in-product examples are AI ride diary generation and a weekly load chart preview. AI diary uses a protected server-side Orider AI credit. Weekly load can run from the signed-in rider's own activity summaries, with demo data shown to signed-out visitors.

## Recipe Principles

- Use only the rider's own data.
- Prefer read-only flows.
- State required scopes up front.
- Keep tokens out of frontend bundles and screenshots.
- Include safe polling intervals for automation.
- Make privacy tradeoffs explicit.
- Share the useful idea even if the API integration is still mocked.

## Recipe Template

```md
# Recipe: <short title>

## Showcase Summary

One sentence for an Orider Creator Hub card.

## What It Builds

One or two sentences describing the chart, alert, report, export, or automation.

## Required Data

| Data | Planned scope | Notes |
|---|---|---|
| Activities | `activities:read` | e.g. last 30 days. |
| Streams | `streams:read` | Only if point-by-point analysis is needed. |
| Fitness summary | `fitness:read` | Only if load/readiness metrics are needed. |

## Privacy Notes

- Uses only the signed-in rider's own data.
- Does not publish precise location unless the rider chooses to.
- Does not store access tokens in browser code.

## Example Flow

1. Fetch or mock the required data.
2. Normalize units.
3. Run the calculation or transformation.
4. Render the chart, send the alert, or write the report.

## Example Output

Add a screenshot, chart image, table, or short sample payload.

## Shareable Result

Describe what a rider can safely share inside Orider:

- private only,
- redacted card,
- link-only page,
- community post,
- public-safe widget.

## Review Checklist

- [ ] No secrets in code, logs, screenshots, or docs.
- [ ] Required scopes are minimal.
- [ ] Rate or polling interval is documented.
- [ ] Private activities stay private by default.
- [ ] Failure states are handled.
```

## Flagship Recipes

These five recipes are the first polished examples for Creator Hub:

| Recipe | Result | Email support |
|---|---|---|
| [AI Ride Diary](ai-ride-diary-en.md) | Private diary draft plus redacted share card. | Sends the private-safe summary to the signed-in rider. |
| [Weekly Load Report](weekly-load-report-en.md) | Weekly training load digest and chart card. | Sends aggregate weekly report. |
| [Hard-Day Streak Alert](hard-day-streak-alert-en.md) | Recovery warning when hard days stack up. | Sends explicit email-to-self alert. |
| [Long-Ride Log Package](long-ride-log-package-en.md) | GPX/private export path plus coach-ready notes. | Sends summary/checklist, not route files. |
| [Monthly Ride Badge](monthly-ride-badge-en.md) | Public-safe progress badge and post draft. | Sends badge preview. |

Email delivery is supported as an explicit, user-triggered action from Creator Hub. Recurring email delivery needs a separate opt-in, unsubscribe path, quiet-hours/frequency settings, and abuse monitoring.

## Additional Recipe Docs

| Recipe | Result | Notes |
|---|---|---|
| [Z2 Target Reminder](z2-target-reminder-en.md) | Private reminder when weekly aerobic-base minutes are behind target. | Uses demo data and aggregate zone minutes only. |

## Starter Recipe Ideas

| Idea | Uses | Why riders may care |
|---|---|---|
| Weekly load chart | `activities:read`, `fitness:read` | See whether training is building, flat, or too aggressive. |
| High-intensity streak alert | `activities:read` | Avoid stacking too many hard days without recovery. |
| [Z2 target tracker](z2-target-reminder-en.md) | `activities:read` | Track aerobic base work against a weekly target. |
| Long-ride Notion log | `activities:read` | Keep a narrative archive of endurance rides. |
| GPX export helper | `activities:read`, `streams:read`, `exports:read` | Move owned activity data into another personal tool. |
| Discord recovery reminder | `fitness:read` | Share a private reminder to rest or lower intensity. |
| Personal website ride widget | `activities:read` | Publish selected public-safe summaries without exposing private routes. |
| AI ride diary | `activities:read`, `streams:read`, `fitness:read` | Turn owned ride history into a private diary, then share a redacted card if desired. |

AI recipes should use Orider AI credits when running inside Orider: provider API keys stay server-side, each approved recipe gets a small per-rider quota, and recipes must not ask users to paste provider API keys into browser code. The first reference recipe is AI ride diary generation with 5 generations per rider per day.

## Example: Weekly Load Summary

Planned scopes:

- `activities:read`
- `fitness:read`

Privacy notes:

- Aggregate by day or week before sharing.
- Avoid publishing route geometry or exact start locations by default.
- If sending to Discord, Slack, or Notion, mention that data leaves Orider and is governed by that service too.

Pseudo-flow:

```ts
const activities = await fetchOwnActivities({ after: "2026-06-01" });
const dailyLoad = activities.map((activity) => ({
  date: activity.startTime.slice(0, 10),
  load: activity.tss ?? estimateLoad(activity),
}));

const weekly = groupByWeek(dailyLoad);
renderWeeklyLoadChart(weekly);
```

## Example: Three Hard Days Alert

Planned scopes:

- `activities:read`

Suggested polling:

- once per day after the usual sync window,
- not after every page load.

Pseudo-flow:

```ts
const recent = await fetchOwnActivities({ limit: 7 });
const hardDays = recent
  .filter((activity) => (activity.tss ?? 0) >= 80)
  .map((activity) => activity.startTime.slice(0, 10));

if (hasThreeConsecutiveDays(hardDays)) {
  sendPrivateAlert("Three hard training days in a row. Consider recovery.");
}
```

## How To Contribute A Recipe

Open a pull request that adds a markdown file under `docs/recipes/`.

Good recipe PRs include:

- a clear rider benefit,
- a short showcase summary,
- required scopes,
- mocked or sample data if a needed endpoint is not live yet,
- privacy notes,
- shareable result mode,
- expected output,
- small, focused code snippets.

Do not include personal access tokens, precise private routes, real user IDs, emails, provider secrets, or screenshots containing private data.
