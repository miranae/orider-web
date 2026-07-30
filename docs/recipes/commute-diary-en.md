# Recipe: Bike Commute Diary

## Showcase Summary

Layer changing condition, weather, traffic, and a short journal over familiar commute routes, then review recurring weekly patterns.

## What It Builds

Even when the home-to-work route is familiar, each ride can feel different. This recipe keeps short pre-ride and arrival notes beside owned activity summaries, then compares travel time and perceived experience across the week.

It is a personal reflection tool for spotting relationships, not a health diagnosis or a guarantee of crash prevention. Recorded metrics are not assumed to be more accurate than the rider's own experience.

## Required Data

| Data | Scope | Notes |
|---|---|---|
| Activity summaries | `activities:read` | Own dates, times, distance, moving/elapsed time, speed, elevation, and available summary metrics. |
| Daily context | Rider input | Condition, weather, traffic, bike check, and journal notes. |

Exact route coordinates are not needed, so the recipe does not request `streams:read`.

## Recording Flow

### 60 seconds before departure

- Outbound/return commute, bike, and familiar route or expected detour
- Sleep/recovery, energy, mood, and stress on a simple five-point scale
- Optional pain or discomfort note
- Weather and expected road hazards
- Quick helmet, tire, brake, chain, and light check

### Two minutes after arrival

- Automatic summary: date, departure/arrival time, distance, moving/elapsed/stopped time, speed, and elevation
- Optional metrics already present in the activity summary, such as average heart rate, power, or cadence
- Safety feel: rate the overall sense of safety on a simple five-point scale
- Perceived fatigue, breathing, pain, focus, and arrival mood
- Traffic feel, detours, near misses, or equipment issues
- One thing that went well, one change for the next trip, and one moment worth remembering

### Weekly review

- Commute days, total distance, and outbound/return split
- Travel-time and perceived-experience changes on similar routes
- Times, weather, or private notes that repeat alongside low safety ratings or high fatigue
- Maintenance items and the most comfortable conditions
- One thing to keep and one thing to change next week

Rest days and transit trips are recorded as recovery or transport choices, never as failed streaks.

## Data Flow

1. Read only the rider's own activity summaries from the Personal Data API.
2. Attach outbound/return labels and rider-entered check-ins to each commute.
3. Keep the original diary and any location-bearing notes in a private personal archive.
4. Once a week, summarize time, perceived effort, weather, and traffic patterns across similar routes.
5. If the rider chooses to share, generate an aggregate card without exporting original entries.

## Privacy Notes

- Home, workplace, start/end points, exact maps, and raw coordinates are private by default.
- Hazard locations, pain, stress, mood, and free-form journal entries remain private.
- Share cards contain aggregates or selected summaries only: commute days, total distance, outbound/return split, average feel, and a positive moment.
- If carbon or cost savings are included, label them as estimates and state the substituted transport mode and calculation assumptions.
- Weekly comparisons can reveal relationships; they must not be presented as proof of a cause.

## Example Output

Private weekly review:

```txt
6 bike commutes · 84 km this week
Tuesday and Thursday returns used similar routes, with both strong headwinds and high fatigue noted.
Friday morning felt easiest despite lower sleep, alongside lighter traffic.
Next week: use transit or ride easy on Thursday evening and check the front brake.
```

Aggregate share card:

```txt
6 bike commutes · 84 km this week
Best moment: a quiet Friday morning
Home, work, exact routes, and health notes hidden.
```

## Review Checklist

- [x] Uses only owned activities.
- [x] Requests only `activities:read`.
- [x] Keeps home, work, and exact routes private by default.
- [x] Removes health and safety notes from shared results.
- [x] Limits shared results to weekly aggregates.
- [x] Does not frame rest or transit as failure.
