# Recipe: Hard-Day Streak Alert

## Showcase Summary

Warn a rider when hard training days stack up and suggest recovery before fatigue compounds.

## What It Builds

This recipe checks the last 7 days of owned activities and looks for three consecutive hard days. A hard day can be defined by TSS/load, long duration, or high-intensity zone time.

The first production-friendly delivery path is an explicit email-to-self from Creator Hub. A recurring alert should require separate opt-in, frequency controls, and unsubscribe handling.

## Required Data

| Data | Scope | Notes |
|---|---|---|
| Activity summaries | `activities:read` | TSS/load, duration, date. |
| Streams | `streams:read` | Optional; only needed for zone-time based rules. |

## Email Result

The email tells the rider whether a three-day hard streak was detected and gives one concrete next-session suggestion.

Safe defaults:

- sent only to the signed-in rider's verified email,
- no arbitrary recipient field,
- once requested manually unless recurring opt-in exists,
- no raw health streams in the email.

## Example Rule

```ts
const hardDays = recentActivities
  .filter((activity) => activity.tss >= 80 || activity.movingTimeSeconds >= 7200)
  .map((activity) => activity.startTime.slice(0, 10));

if (hasThreeConsecutiveDays(hardDays)) {
  return "Break the fatigue chain with recovery or 45-60 minutes in Z1/Z2.";
}
```

## Example Output

```txt
A three-day hard-training streak was detected in the last 7 days.

Suggestion: Break the fatigue chain with recovery or 45-60 minutes in Z1/Z2.
```

## Shareable Result

- Private notification preview.
- Anonymized screenshot of the rule.
- No public route or health stream data.

## Review Checklist

- [x] Uses owned activity data only.
- [x] Provides a clear recovery suggestion.
- [x] Supports email-to-self.
- [ ] Recurring alert needs opt-in, unsubscribe, and quiet hours.
