# Recipe: AI Ride Diary

## Showcase Summary

Turn a week of owned Orider activity data into a private training diary, then share only a redacted card.

## What It Builds

This recipe creates a private diary draft from the rider's recent activities, training load, and recovery context. The full diary stays private. The shareable result is a short card that removes exact locations, route geometry, names, IDs, and sensitive health details.

Inside Orider, the AI call runs server-side through Orider AI credits. Provider API keys are never placed in browser code or recipe files.

## Required Data

| Data | Scope | Notes |
|---|---|---|
| Activity summaries | `activities:read` | Last 7 or 30 days. |
| Streams | `streams:read` | Optional; only for richer ride context. |
| Fitness summary | `fitness:read` | Used for fatigue/load framing. |

## Email Result

Creator Hub can send a diary result email to the signed-in rider's own verified account email.

Email constraints:

- no arbitrary recipient address,
- explicit user action required,
- 5 creator recipe emails per rider per day,
- exact route and location data excluded,
- recurring delivery requires a separate opt-in flow.

## Example Flow

1. Fetch recent owned activities.
2. Summarize aggregate distance, time, elevation, and load.
3. Generate a private diary draft through server-side AI credits.
4. Render a redacted share card.
5. Optionally email the result to the rider's account email.

## Example Output

Private diary title:

```txt
A steady week that held through the climbs
```

Share card:

```txt
182 km total with 2,140 m climbed. After a hard Wednesday, Friday shifted to recovery and the weekend long ride settled back into a steady pace.

Exact location and sensitive metrics hidden.
```

## Shareable Result

- Private draft: full diary, rider only.
- Redacted card: aggregate stats and selected sentence.
- Community post: editable text before publishing.

## Review Checklist

- [x] Uses only owned data.
- [x] Keeps provider keys server-side.
- [x] Makes full diary private by default.
- [x] Removes exact locations from shared output.
- [x] Supports email only to the signed-in rider.
