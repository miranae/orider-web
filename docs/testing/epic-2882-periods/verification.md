# R6 KST comparison controls — 2026-10-26

This slice adds date selection and labels. It does not change server calculations, PMC historical timezone migration, activity eligibility, or rollout flags.

## Calendar contract

- Custom date ranges are KST inclusive dates, sent as exact `[fromInclusive, toExclusive)` timestamps. Today is capped at request time.
- Four weeks means the last 28 completed KST dates, excluding today, versus the immediately preceding 28 completed dates. No overlap or partial-day bias.
- Year-to-date means January 1 through the current KST month/day/clock, paired with the previous year. Feb 29 maps to Feb 28 in a non-leap year. Jan 1 exactly at midnight is an empty period and is rejected by the existing request validation.
- The existing power-skills 56-day preset remains a rolling 56×24-hour interval, explicitly labeled separately.
- Choosing a preset, editing dates, or changing units clears the prior result and never auto-submits a request.
- The existing UTC helper is preserved for unrelated consumers.

## Source/aggregation inventory and remaining R6 acceptance

| Surface | Existing boundary | Remaining acceptance |
|---|---|---|
| Power period curves | Owner-only measured power, up to 1000 scanned activities per period; separate W/kg winners use calculation weight snapshots | Native/Strava linked-copy candidate policy must be reconciled explicitly with period totals before claiming identical populations |
| Training period totals/zones | Up to 200 scanned activities, explicit identity representative dedupe; final complete canonical metrics, explicit summary fallback only for missing/old metrics; missing/rejected values remain unavailable | Stage-only UI/API capability and production readiness still need real-account evidence |
| PMC | Existing physical ride and historical day-basis rules | This change does not rebin old CTL/ATL/TSB data or replace recorded FTP/weight history |

Partial scans remain partial; no finite-page result is labeled a complete lifetime record. The current web/BE contracts have different populations and must not be silently normalized. This is not completion of issue miranae/orider-g1-web#3375.

## Validation

- 20 targeted calendar/component tests passed, including UTC/KST year boundary, leap day, adjacent equal 28-day windows, future/impossible dates and explicit submission.
- `build:dev` passed with Node22 and matching lockfile dependencies.
- Chrome actual React source at 390×844: four-week and annual selection, explanatory labels and controls fit the viewport. Screenshots below use stubbed auth/API and contain no real activity data; they do not prove backend transport or production behavior.
- Node22 full suite: 869 files / 9305 tests PASS; contract tests, lint:budget, quality:budget, dev and production builds PASS. The inherited sample VITE_SEGMENT_TILES_BASE was cleared only for the test process. Production build used the already verified public AI API base; no .env files were changed.
- Full-suite athlete chart test used bare ISO parsing (UTC) for a local date label; at Korean Monday midnight it falsely treated the current week as future. The assertion now parses that date at local midnight.

![Four complete weeks](mobile-four-weeks.png)
![Year comparison](mobile-year.png)
