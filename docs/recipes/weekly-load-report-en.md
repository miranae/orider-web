# Recipe: Weekly Load Report

## Showcase Summary

Send a Monday-ready training load digest with distance, time, activity count, and load trend.

## What It Builds

This recipe turns recent Orider activities into a weekly training report. It helps riders see whether the current week is building, flat, or too aggressive without exposing individual activity routes.

The result can be shown in Creator Hub, copied as a share card, or emailed to the rider's own account email.

## Required Data

| Data | Scope | Notes |
|---|---|---|
| Activity summaries | `activities:read` | Distance, moving time, elevation, TSS/load. |
| Fitness summary | `fitness:read` | Optional; useful for CTL/ATL/readiness framing. |

## Email Result

The email contains only aggregate values:

- number of sessions,
- total distance,
- total moving time,
- total load,
- a simple next-action suggestion.

It does not include route geometry, exact start locations, activity titles, or raw streams.

## Example Flow

```ts
const activities = await fetch("/api/v1/activities?after=2026-06-01", {
  headers: { "X-API-Key": personalApiKey },
}).then((res) => res.json());

const week = summarizeWeek(activities.data);
const state = week.tss >= 450 ? "high load" : week.tss >= 220 ? "building" : "light";
```

## Example Output

```txt
This week looks like a building week.

- 4 sessions
- 188 km
- 7 h
- 344 load

Next action: keep the rhythm, but check recovery before the next hard session.
```

## Shareable Result

- Public-safe chart card.
- Email digest to self.
- Community post with aggregate stats only.

## Review Checklist

- [x] Aggregates before sharing.
- [x] Avoids precise route and start location.
- [x] Can run as a manual email send.
- [ ] Recurring email requires opt-in and unsubscribe.
