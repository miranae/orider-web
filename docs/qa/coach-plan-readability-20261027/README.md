# Coach plan readability

Target route: `/ko/coach/plan?sport=bike&date=2026-10-01`. Inspected the authorized live session and supplied screenshot. Committed screenshots use synthetic records only, rendered through the actual DayCell, PhaseBar, MobilePlanContent, PlanDayLoadComparison and PlanWeekLoadSummary components in the React catalogue.

- [1440px desktop, light](desktop-light.png): phase timeline and management actions occupy separate rows; each calendar day aligns planned and actual TSS in two rows.
- [Expanded record evidence](desktop-evidence.png): ratio, difference and saved candidate link remain available.
- [390px mobile, dark](mobile-dark.png): week navigation stays on one line, and the weekly fulfillment appears once before the date list.
- A weekly target is not a completed daily prescription: saved outcomes remain unchanged and visible.
- Verified a native comparison disclosure does not invoke the day editor by click or keyboard.
- Zero, unknown and future actual load remain distinct.

Checks: 69 calendar/mobile/record tests, TypeScript through build:dev, ESLint and quality budget. No data writes or calculation changes.
