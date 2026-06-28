# Recipe: Long-Ride Log Package

## Showcase Summary

Package a long ride into GPX, markdown notes, and a coach-ready checklist.

## What It Builds

This recipe helps a rider turn a long activity into a portable training record. It identifies a long ride, prepares a GPX/private export path, and creates a markdown summary that can be pasted into Notion, a coaching log, or a personal archive.

Because route data is sensitive, the file output is private by default. Public sharing should use a redacted summary card.

## Required Data

| Data | Scope | Notes |
|---|---|---|
| Activity summaries | `activities:read` | Find candidate long rides. |
| Streams | `streams:read` | Required for GPX route export. |
| Exports | `exports:read` | For generated GPX/TCX/FIT-style output. |

## Email Result

The email does not attach GPX files. It sends the candidate ride summary and checklist only, because attachments may contain precise location data.

## Example Flow

1. Fetch recent owned activities.
2. Pick the longest ride in the last 30 days.
3. Prepare private export action for GPX.
4. Generate markdown notes:
   - distance,
   - duration,
   - elevation,
   - fueling notes,
   - pacing notes,
   - recovery notes.
5. Email the summary/checklist to the rider.

## Example Output

```md
## Long Ride Notes

- Distance: 142 km
- Moving time: 5 h 18 m
- Elevation: 1,940 m
- Pacing: steady endurance with late fatigue check
- Fueling: add carbohydrate note
- Recovery: protein + easy spin within 24-48 h
```

## Shareable Result

- Private export file.
- Coach-ready markdown.
- Public-safe aggregate card without route geometry.

## Review Checklist

- [x] Does not email route files.
- [x] Marks location data as sensitive.
- [x] Keeps exported GPX private by default.
- [x] Provides a useful non-location email result.
