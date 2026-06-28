# Recipe: Z2 Target Reminder

## Showcase Summary

Remind a rider when their weekly aerobic-base target is falling short, using only owned activity summaries and zone aggregates.

## What It Builds

This recipe checks the rider's current week against a personal Zone 2 target. It produces a private reminder that can be shown in Creator Hub, sent as an explicit email-to-self preview, or copied into a personal planning note.

The recipe is intentionally conservative: it does not read route geometry, raw GPS streams, activity titles, private notes, or other riders' data.

## Required Data

| Data | Scope | Notes |
|---|---|---|
| Activity summaries | `activities:read` | Date, sport, moving time, load/TSS if available. |
| Zone aggregates | `activities:read` or `fitness:read` | Weekly Z2 minutes from precomputed power/heart-rate/pace zone summaries. |
| User settings | local recipe config | Weekly target minutes and reminder day. Store outside the API token. |

No `streams:read` scope is required for the default version. Use streams only if a future version recalculates zones locally.

## Privacy Notes

- Uses only the signed-in rider's own activity summaries and aggregate zone time.
- Does not include precise locations, route geometry, activity IDs, titles, photos, comments, or health notes in the reminder.
- Sends output only after an explicit rider action. Recurring delivery needs separate opt-in, unsubscribe handling, and frequency controls.
- If the reminder is copied to Discord, Slack, Notion, or another service, the rider should treat that as data leaving Orider.
- Never put a Personal Data API key in browser code, screenshots, logs, markdown examples, or public repositories.

## Demo Data

```json
{
  "targetMinutes": 240,
  "weekStartsOn": "2026-06-22",
  "today": "2026-06-26",
  "activities": [
    { "date": "2026-06-22", "sport": "ride", "movingMinutes": 68, "z2Minutes": 42, "load": 64 },
    { "date": "2026-06-24", "sport": "ride", "movingMinutes": 51, "z2Minutes": 26, "load": 48 },
    { "date": "2026-06-25", "sport": "run", "movingMinutes": 38, "z2Minutes": 18, "load": 37 }
  ]
}
```

This sample is synthetic. It does not contain real user IDs, emails, tokens, activity IDs, or route data.

## Example Flow

1. Fetch or mock the rider's activity summaries for the current week.
2. Sum `z2Minutes` from precomputed zone aggregates.
3. Compare progress against the weekly target and remaining days.
4. Generate a private reminder only if the rider is behind target by a meaningful margin.
5. Render a Creator Hub preview, email-to-self draft, or personal planning note.

```ts
type ActivitySummary = {
  date: string;
  sport: "ride" | "run" | "swim" | "other";
  movingMinutes: number;
  z2Minutes: number;
  load?: number;
};

type ReminderInput = {
  targetMinutes: number;
  today: string;
  activities: ActivitySummary[];
};

function buildZ2Reminder({ targetMinutes, today, activities }: ReminderInput) {
  const completed = activities.reduce((sum, activity) => sum + activity.z2Minutes, 0);
  const remaining = Math.max(targetMinutes - completed, 0);
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const remainingDays = Math.max(7 - day, 1);
  const suggestedDailyMinutes = Math.ceil(remaining / remainingDays);

  if (remaining === 0) {
    return {
      state: "complete",
      message: `Z2 target complete: ${completed}/${targetMinutes} min.`,
    };
  }

  return {
    state: completed / targetMinutes < 0.5 ? "behind" : "on-track",
    message: `Z2 progress: ${completed}/${targetMinutes} min. Aim for about ${suggestedDailyMinutes} min/day for the rest of the week.`,
  };
}
```

## Example Output

```txt
Z2 progress: 86/240 min.

You are 154 min short of this week's aerobic-base target.
Two easy endurance rides of 75-80 min would close the gap without adding high-intensity load.
```

## Creator Hub Card

| Field | Value |
|---|---|
| Title | Z2 Target Reminder |
| Kind | Alert |
| Required scopes | `activities:read`, optional `fitness:read` |
| Channels | Creator Hub preview, email-to-self, private planning note |
| Share mode | Notification preview with aggregate minutes only |
| Safe public result | "I am targeting 240 min of Z2 this week. Routes and exact activities hidden." |

## Shareable Result

Recommended public-safe card:

```txt
Aerobic base week: 86/240 min Z2 complete.
Routes hidden. Activity details private.
```

Private-only fields:

- exact activity dates,
- individual activity load,
- raw heart-rate/power/pace stream values,
- route or start location,
- any note explaining illness, fatigue, medication, or injury.

## Failure States

| State | Behavior |
|---|---|
| No activities this week | Show a neutral setup prompt, not a warning. |
| Zone aggregates unavailable | Explain that the recipe needs zone time from synced activities. |
| Target is missing | Ask the rider to set a weekly Z2 target before running. |
| API request fails | Keep the previous reminder hidden and show a retryable private error. |

## Review Checklist

- [x] Uses owned data only.
- [x] Requires only read scopes.
- [x] Uses demo data without real IDs, emails, tokens, or private routes.
- [x] Keeps locations and activity titles out of the reminder.
- [x] Includes a Creator Hub summary and card fields.
- [x] Documents email-to-self as explicit and non-recurring by default.
