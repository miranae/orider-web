# Coach condition readability

Route: `/ko/coach/condition`. Inspected the authorized live delegated session before editing. All committed screenshots use synthetic data from the live React catalogue at `/design-system-controls.html`.

- [Desktop, light, 1280 × 900](desktop-light.png): state and gauge on the left; metrics, action and date on the right. Quality status remains visible with expandable evidence.
- [Mobile, dark, 390 × 844](mobile-dark.png): state → metrics → action → quality status → trend in one reading column.
- [Desktop activity selection](desktop-activity.png): recent records and their selected contribution align side by side; selection changes both the highlight and displayed values.
- Checked 320px and 390px: document width equals viewport width. Period options and recent activities retain intentional local scrolling on narrow screens.
- Verified data-quality disclosure opens and preserves assessment date, requirements and actions.
- Existing pending/failed calculation status stays outside the disclosure.
- The condition-page coach launcher is in document flow so it cannot cover chart values.

Validation: 50 focused component/condition tests and 77 page/record tests passed; TypeScript, ESLint, quality budget and development build passed. Calculations, canonical-source precedence and training decisions are unchanged.
