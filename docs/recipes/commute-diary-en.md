# Recipe: Bike Commute Diary

## Showcase Summary

Email yourself the last 7 days of bike commute totals and guided reflection prompts to answer in your own words.

## What It Builds

The current Orider result is a private email containing commute count, total distance, total moving time, total elevation gain, and guided reflection prompts. The check-ins, diary archive, and share card described below are ideas you can build; they are not current product features.

This is a personal reflection tool for noticing patterns, not a health diagnosis or a guarantee of crash prevention. Recorded metrics are not assumed to be more accurate than the rider's account.

## Scope for an Extension You Build

The current Creator Hub email reads the signed-in rider's Orider activities on the server and does not require a Personal Data API key.

| Data | Scope | Notes |
|---|---|---|
| Activity summaries | `activities:read` | The rider's dates, times, distance, moving/elapsed time, speed, elevation, and available summary metrics. |

Exact route coordinates are not needed, so the recipe does not request `streams:read`.

## Web Release Dependency

- Deploy the backend `commute-diary` handler in `sendCreatorRecipeEmail` before creating a web production tag.
- In the deployed environment, pass an authenticated smoke test from request through delivery to the rider's own email.
- Confirm that the smoke test creates no share card and sends only the last-7-day totals and fixed reflection prompts to the rider.

## Currently Available

- Recalculates a rolling 7-day window each time the rider requests the report.
- Uses Strava's commute flag or a clearly named commute activity to identify candidates.
- Reports distance and moving time. Comparisons use rides with similar distance and moving time as a baseline.
- Does not infer or store rider condition, weather, or traffic conditions.
- Includes guided reflection prompts. The current Orider result ends with sending the totals and prompts to the rider's account email; it does not collect or store answers.
- Check-in forms, a diary archive, and a share card must be implemented separately.
- If the commute count looks wrong, correct the Strava commute flag or activity name and request the email again. Orider does not currently provide a pre-send candidate picker.
- If no candidates exist, the email says that no commutes were found in the last 7 days and does not substitute another activity. Rides with zero distance or moving time do not form a comparison baseline; totals use the stored activity summaries.

## Extension You Can Build

The following recording flow and private archive are an implementation idea using the Personal Data API. An extension may use route aliases entered by the rider, but it must not assume that Orider identifies or names routes automatically.

### About one minute before departure

- To-work/homebound commute, bike, and a rider-entered route alias or expected detour
- Sleep/recovery, energy, mood, and stress on a simple five-point scale
- Optional pain or discomfort note
- Weather checked by the rider and expected road hazards
- Quick helmet, tire, brake, chain, and light check

### About two minutes after arrival

- Automatic summary: date, departure/arrival time, distance, moving/elapsed/stopped time, speed, and elevation
- Optional metrics already present in the activity summary, such as average heart rate, power, or cadence
- Safety rating: `1 very unsafe` through `5 very safe`
- Rider-reported fatigue, breathing, pain, focus, and arrival mood
- Traffic conditions, detours, near misses, or equipment issues
- One thing that went well, one change for the next trip, and one moment worth remembering

### Weekly review

- Commute days, total distance, and to-work/homebound split
- Travel-time and rider-reported changes across rides with similar distance and moving time
- Conditions and private notes that recur alongside low safety ratings or high fatigue
- Maintenance items and the most comfortable conditions
- One thing to keep and one thing to change next week

Rest days and transit trips are recorded as recovery or transport choices, never as failed streaks.

## Data Flow

Current Orider flow:

1. Read only the rider's activity summaries from the rolling last 7 days.
2. Select candidates using the commute flag or a clear activity name. Orider does not currently provide a pre-send candidate picker.
3. Email commute count, total distance, total moving time, total elevation gain, and guided reflection prompts to the rider's account.

Extension you can build:

1. Attach to-work/homebound labels and rider-entered check-ins to each commute.
2. Keep original diary entries and any notes that may reveal location in a private archive.
3. Once a week, review records from rides with similar distance and moving time.
4. If the rider chooses to share, generate only a weekly aggregate card without exporting original entries.

## Privacy Notes

- The current Orider result goes only to the rider's email and does not create a share card.
- If an extension adds sharing, limit it to weekly aggregates such as commute count, total distance, and total moving time.
- Exclude free text, home, workplace, start/end points, exact maps, raw coordinates, hazard locations, and health or mood notes by default.
- Before sending, review even aggregate copy for clues about places, weekdays, times, or recurring schedules that could reveal home or work.
- If carbon or cost savings are included, label them as estimates and state the substituted transport mode and calculation assumptions.
- Weekly comparisons can show patterns; they must not be presented as proof of a cause.

## Example Output

Current email to the rider (abbreviated to show the main fixed sections):

```txt
Last 7 days
- 6 bike commutes
- 84 km · 4 h 12 min · 620 m climbed
- 4 rides with similar distance and moving time form the comparison baseline.

Fixed prompts · Daily writing
- Pre-ride body condition (1 very poor–5 very good): ____
- Post-ride fatigue (1 very low–5 very high): ____
- How safe the ride felt (1 very unsafe–5 very safe): ____
- Weather and road conditions: ____
- Traffic and stops: ____
- One-line note: ____

7-day reflection
- What felt easier or harder on rides with similar distance and moving time?
- What is one thing to keep and one thing to adjust over the next 7 days?

This email contains no inferred condition, weather, traffic, or diary text.
```

Weekly aggregate card from an extension:

```txt
6 bike commutes · 84 km · 4 h 12 min moving in the last 7 days
Home, work, exact routes, weekdays, times, and free text excluded.
```

## Review Checklist

- [x] Uses only the rider's activities.
- [x] The extension requests only `activities:read`.
- [x] Limits the current result to a 7-day aggregate and guided reflection prompts sent by email without collecting answers.
- [x] Separates check-ins, archive, and share card as extension ideas.
- [x] Limits extension sharing to weekly aggregates and excludes free text and identifying clues.
- [x] Does not frame rest or transit as failure.
