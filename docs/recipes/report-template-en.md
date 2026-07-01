# Report Recipe Template

Use this template when a Creator Hub recipe should feel like a workout analysis report instead of a basic notification.

## Base Structure

```md
# <Report name>

## One-line Readout

Write the main state for the period in one sentence.

Example: This was a lighter recovery-oriented week.

## Core KPIs

| Metric | Value | Comparison |
|---|---:|---|
| Weekly load | 344 | +18% vs previous 7 days |
| Distance | 182 km | -6% vs previous 7 days |
| Moving time | 7 h 12 min | 4 sessions |

## Charts

- Daily load bar chart.
- Distance/time/load change versus the previous week.
- Optional: CTL/ATL/TSB, zone time, elevation distribution.

## Key Sessions

- Longest session.
- Highest-load session.
- Optional map/elevation thumbnail for the rider's private report.

## Next Actions

1. Recommended intensity for the next 24-48 hours.
2. Recovery signals to check before the next hard session.
3. Metrics to re-check in the next report.

## Shareable Summary

Keep only text that removes routes, start/end locations, activity titles, and raw heart-rate/power streams.
```

## HTML Card Rules

- Keep the header to the title and one-line readout.
- Limit KPI cards to 3-4 metrics.
- Charts should support the numbers; do not add decorative graphics only.
- Use map/route thumbnails only in private reports.
- Public reports should use aggregate charts and date-level hints.

## Data Safety Defaults

| Field | Default |
|---|---|
| Activity title | Exclude |
| Start/end location | Exclude |
| Route geometry | Exclude |
| Map/route thumbnail | Optional in private reports only |
| Detailed HR/power streams | Exclude |
| Aggregate distance/time/elevation/load | Allowed |
| Date-level hints | Allowed |

## What A Developer PR Should Include

- Required scopes.
- API call order.
- Sample input/output.
- Screenshot or HTML report example.
- Separation between private report and public summary.
- Automation frequency.
- Failure and retry policy.
- How API keys and external service secrets are stored.

