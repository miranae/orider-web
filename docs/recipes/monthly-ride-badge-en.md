# Recipe: Monthly Ride Badge

## Showcase Summary

Create a public-safe monthly badge from distance, elevation, active days, and longest ride.

## What It Builds

This recipe gives riders a reason to share progress without revealing private routes. It aggregates the current month into a badge suitable for a personal website, Orider community post, or screenshot.

The badge is intentionally simple: no raw streams, no exact location, no private activity titles.

## Required Data

| Data | Scope | Notes |
|---|---|---|
| Activity summaries | `activities:read` | Monthly distance, elevation, active days, longest ride. |

## Email Result

The email sends a badge preview to the rider's own account email. It can be used as a self-check before copying the result into a public profile or community post.

## Example Output

```json
{
  "month": "2026-06",
  "distanceKm": 612,
  "elevationGainM": 8420,
  "activeDays": 14,
  "longestRideKm": 142,
  "privacy": "route_hidden"
}
```

Share card:

```txt
June ride badge: 612 km, 8,420 m climbed, 14 active days, longest ride 142 km.
Routes hidden by default.
```

## Shareable Result

- Public-safe badge image/card.
- Embeddable JSON.
- Orider post draft.

## Review Checklist

- [x] Uses monthly aggregates only.
- [x] Hides routes by default.
- [x] Lets the rider choose which fields become public.
- [x] Works as an email-to-self preview.
