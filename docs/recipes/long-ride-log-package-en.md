# Recipe: Long-Ride Log Package

## Showcase Summary

Package a long ride into a coach/Notion-ready record draft, fueling review, and next-ride questions.

## What It Builds

This recipe helps a rider turn a long activity into a portable training record. It identifies the longest recent ride, prepares a private GPX/TCX/FIT export path, and creates a markdown record that can be pasted into Notion, a coaching log, or a personal archive.

The useful output is not the file link alone. The package should preserve the next-ride baseline: distance, moving time, average speed, elevation, HR/power if available, fueling prompts, pacing notes, and coach questions.

Because route data is sensitive, the file output is private by default. Public sharing should use a redacted summary card.

## Required Data

| Data | Scope | Notes |
|---|---|---|
| Activity summaries | `activities:read` | Find candidate long rides. |
| Streams | `streams:read` | Required for GPX route export. |
| Exports | `exports:read` | For generated GPX/TCX/FIT-style output. |

## Email Result

The email does not attach GPX/TCX/FIT files. It sends the candidate ride summary, record draft, ride readout, and checklist only, because route files may contain precise location data.

## Example Flow

1. Fetch recent owned activities.
2. Pick the longest ride in the last 30 days.
3. Prepare private export action for GPX.
4. Generate markdown notes:
   - distance,
   - moving time,
   - average speed,
   - elevation,
   - HR/power baselines where available,
   - fueling notes,
   - pacing notes,
   - recovery notes.
5. Email the summary/checklist to the rider.

## Example Output

```md
## Long Ride Log - 2026-06-28

- Activity: Afternoon Mountain Bike Ride
- Distance: 84.0km
- Moving time: 3h 11m
- Average speed: 26.4km/h
- Elevation: 193m
- Average HR: 143bpm
- Average power: 124W

## Ride note
- Goal: endurance / distance adaptation / route scouting
- What worked:
- What got hard:
- Last 30 minutes:

## Fueling log
- Before ride:
- Carbohydrate during ride:
- Fluids/electrolytes:
- Adjustment for next time:

## Coach questions
- Is this intensity appropriate for longer rides?
- How much should fueling increase before the next long ride?
- Where should recovery or the next hard session go?
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
