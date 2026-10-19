# Club ride detail quality review / 같이한 활동 상세 검수

Scope: local implementation and independent planning/design/code review using `screen-quality-loop`. No commit, push, PR, merge or deployment. Private route/account screenshots remain outside the repository.

## Information and action inventory

| Information/action | Meaning and previous problem | Intended final presentation |
| --- | --- | --- |
| Activity/participant count | Distinct records versus users; multiple records from the same user | Both counts, inclusion scope, disambiguated record labels |
| Record selection | Map/flow selection was distant on mobile and occupied an empty desktop sidebar | Before full-width map, explicit scope and pressed states |
| Route map | Fixed narrow area | Default/large area controls, separate fit-all, camera retained |
| Performance comparison | Independent record distances and missing sensor ownership; overlaid metrics obscure each other | Separate HR/power/speed panels, common distance or actual-clock axis and cursor; elevation secondary |
| Detailed sample comparison | Hover index from another record could exceed base length and unmount the panel | Coordinate-based selection; persistent structure outside charts, explicit selection clearing |
| Zoom | Need to inspect shorter sections | Shared range for every metric, zoom buttons, explicit range selection and reset; wheel remains page scrolling |
| Summary comparison | Four bars plus two overlapping tables | Removed after the user requested one comparison table; individual activity links move to the chart comparison |
| Photos | Feature-gated gallery | After comparison; record attribution retained |
| Loading/error/absence | GCS metadata silently ignored; auth transition could cancel requests without restarting | Canonical authenticated GCS API, explicit errors/retry, fetched context guard |
| Typography/terms | Lazy direct entry omitted ClubSurface.css; inconsistent text roles | Explicit common CSS import, DS Text roles, accent-only glossary triggers with focus preserved |

## Runtime environment recovery

The initial review was incomplete: summary/map thumbnails rendered but App Check failed and charts were absent. This was not complete screen acceptance.

- Reused the existing registered development App Check credential and long-polling settings from the previous local QA environment; values remain in ignored local configuration.
- Production Personal API rejects localhost CORS. A temporary ignored loopback development configuration forwards only exact authenticated GET stream requests to the existing ORider API. Backend authentication and activity visibility checks remain enforced; no remote security configuration or GCS direct-download path was changed.
- Actual authenticated source data now loads four records, including the GCS-backed ORider record. Distance and actual-clock comparison both render all four.
- Fonts were measured in a fresh direct entry: page title 22px, section headings 16px, body 14px, supporting text 13px; common Pretendard family.

## Data and interaction safeguards

- Preserve public and own activity queries, companion inclusion and account-change request fences.
- Preserve distinct activity records and real zero speed/power versus unavailable data. Nonpositive heart rate is unavailable, not a physiological 0 bpm.
- Actual-clock mode validates timestamp units, preserves different start times, and does not reconstruct time from distance/speed or array indices. Ambiguous clock data remains excluded with an explanation.
- Sample matching does not extend records past their bounds or carry values across long gaps. Show actual sample timestamps.
- Chart coordinates must remain independent of the number/order of samples in other datasets. The pointer and keyboard must not race through unrelated dataset indexes.
- Local preview mobile checks use a same-origin iframe at measured widths when the browser viewport override is ineffective; they do not prove physical touch-device acceptance.

## Validation status

- Latest inline-average targeted suite: 61/61 tests across five relevant files passed. Earlier single-table-mode suite: 63/63 across six files passed. The baseline production build and quality budget passed before the subsequent inline-average and control follow-ups. Those follow-ups are verified with targeted tests, changed-file lint, TypeScript and `git diff --check`; no later production build or deployment is claimed.
- Independent code review approved the final chart, range calculations, auth transition and presentation changes. Planning and design each passed their observed desktop/mobile scope in separate review.
- Actual authenticated distance and clock modes rendered all four source records. No fixture data is used as acceptance evidence.
- Physical touch-device operation and nonempty photo/permission states remain outside observed acceptance. Stationary touch selection has a targeted regression test.

## Final real-screen checks

- Heart rate, power and speed have separate synchronized lanes. Power has a faint non-stacked area; elevation is a subdued secondary strip. Long time gaps break lines.
- Zoom buttons, native drag selection and reset update every lane together. Pointer movement from chart to comparison retains values; clearing the point retains the selected interval. The final point table remained mounted at 374.5px height and unchanged offset.
- The chart footer uses one comparison table. Each heart-rate/power/speed cell shows the instantaneous sample with a smaller secondary observed average beneath it. The current chart interval defines the average, including the full displayed interval before zoom. Sampling/coverage details remain available through the common InfoTip. The separate whole-activity summary table and comparison-mode buttons were removed at the user’s request; individual activity links remain in the sole table.
- KO 390px and EN 320px pages have no document overflow. At 320px, names and the first heart-rate value are fully visible; horizontal table scrolling retains sticky names. The final 390px point table and all three metric lanes were independently reviewed.
- Redundant altitude axis titles were removed to prevent narrow-screen overlap. Tooltip triggers use the common accent-only style; opening and Escape closing were checked.

## Requested range comparison contract

The user subsequently requested chart-footer selected-range indicators in the same table form as whole-activity comparison. The user requested one table with two lines in each metric cell: the point value above and a smaller gray average below, without mode controls. Average scope follows the chart display interval rather than the hovered point. The separate whole-activity table is removed, while activity-detail links are retained in the single comparison table.

Interval values must be observed-time-weighted averages from already authorized streams, not replacements for canonical whole-activity summary metrics and not calls to the owner-only analysis endpoint. Intersect valid sample-owned intervals with the selected time/distance window, exclude gaps/missing values from each metric's denominator, do not extend the last sample, preserve zero power/speed and exclude nonpositive heart rate. Show per-metric observed time and partial coverage. Whole-range reset restores averages for the full displayed chart interval. These are stream-derived observed averages and do not silently reuse canonical activity-summary metrics.

## Final inline-average acceptance

Actual authenticated four-record clock comparison confirmed one page table, no mode button and no separate whole-activity summary. Each primary metric cell has an instantaneous value plus a 13px ink-2 observed average underneath. Clearing the point preserves averages; resetting zoom changes the scope to the full displayed interval and recalculates averages. Missing and real-zero values remain distinct. Activity names retain individual-detail links.

## Chart controls and map interval follow-up

Requested: lighter, coherent metric and zoom controls; short heart-rate naming; show the zoomed chart interval on the route map; reuse the activity-detail `//` map-area control in the top-left and bottom-right corners.

The map highlight follows each record's validated distance or real-clock samples. It must not bridge invalid coordinates or long sample gaps, and must clear when the chart interval resets or changes axis. Keep the user's camera while updating route emphasis. Map area resizing remains a two-state layout control, distinct from geographic scale.

Final follow-up evidence: control/common map-area component tests 21/21; route/page tests 52/52, including all-invalid GPS guidance and single-point marker preservation; ES2020-compatible map helper retest 8/8. Independent code review approved. Independent planning and design each passed the desktop and 390px observed scope. Actual four-record UI checks confirmed map height 480 → 864 → 480 using opposite corners, real-clock viewport highlighting, reset/axis-change clearing, and mobile document width equal to scroll width (390px). Geographic camera controls remain separate from area size. Physical-device touch remains unverified. Responsive harness files and tabs were removed after inspection.

## Power/speed chart density follow-up

The user found raw power/speed traces too busy. The existing chart passed every raw point, including off-screen points, to Chart.js and filled overlapping power areas. The requested fix is display-only: average visible samples into common width-aware x bins, remove power fill, and restore finer detail as the viewport narrows. Preserve null/long-gap boundaries and real zero values; keep raw sample inspection, observed average calculations and map ranges unchanged. Label the chart's display aggregation separately from raw table values and canonical metrics. No extra smoothing controls are requested.

Implementation references: Chart.js [performance guidance](https://www.chartjs.org/docs/latest/general/performance.html) recommends reducing dense data before rendering and avoiding unnecessary curve work; [interaction configuration](https://www.chartjs.org/docs/latest/configuration/interactions.html) documents the default hover events. Custom wrapper-pointer selection remains the sole interaction path, with built-in chart events disabled. Sparse viewport edge anchors must be preserved only across valid continuous sample edges, without including off-screen values in display-bin averages.

Final density follow-up: targeted helper/chart tests 17/17, changed-file ESLint, incremental full-project TypeScript and diff check passed. Independent code review approved after sparse viewport boundary anchors were fixed. Independent planning and design each passed actual four-record desktop whole/zoom and 390px mobile screenshots. A synthetic 12,000-point fixture reduces to 198 binned points at 1,400px and 38 at 280px, reserving two edge anchors within a 240-point limit. These are point-count tests, not measured frame-time claims. Actual UI checks confirmed 71.2km → 17.8km → 0.28km progressive detail, raw instantaneous table values and synchronized map highlighting. Responsive QA harness/tab removed. No commit, push or deployment.

A subsequent small user-requested smoothing adjustment increases display-bin width from 7px to 9px. The same synthetic fixture now yields 153 bins at 1,400px and 29 at 280px; caps, anchors, gap handling and zoom-to-raw behavior remain unchanged. This changes display granularity only.

Toolbar-only follow-up: replaced separate outlined zoom controls with one muted toolbar, selection-frame icon and icon-only full-range reset. Actual 320px preview confirmed 221.125px toolbar width, 48px height, four non-overlapping 44px-high targets and no document overflow. Active selection and desktop zoom/reset were checked. Independent code/planning/design reviews passed; existing chart tests 9/9, cached full-project TypeScript, changed-file lint and diff check passed. No chart calculation, map or metric-control changes. Temporary responsive harness removed.

## Design-system ownership foundation

Shared control appearance now belongs to `src/theme/components/`: ControlToolbar/ToolbarButton, ToggleControls/ToggleButton, MapResizeControls/MapNavigation/MapControlButton, ChartLane/ChartPlot/ChartRangeCaption/ChartValue and existing chart frame/header/legend primitives. Canvas presentation policy and generic series sampling live in pure `src/theme/charts/` modules. Current club, activity media and RouteMap consumers use those exports; data, clock, camera actions and domain calculations remain in features. The previous map-control CSS and page control/lane/value overrides were removed.

The canonical live React catalogue is `/design-system-controls.html`, linked from the legacy static catalogue and theme documentation. It uses generated/runtime tokens, fixture content and in-memory light/dark mode without account settings or backend calls. `AGENTS.md` and the component README define the extension workflow. The ownership guard runs in `quality:budget` and rejects new or changed explicit protected DS class selectors outside the component directory. Existing legacy rules in 40 other files (126 rules) are fingerprinted exceptions; this is not a claim to detect every inline or indirect override, nor a site-wide migration.

Verification: DS suites 38/38, consumer suites 88/88 (bounded workers after parallel-startup timeout), ownership guard 6/6, hosting evidence 3/3, changed-file lint, quality budget and full production build/type checking passed. The built application entry remains `assets/index-*.js`; the catalogue has its own hashed entry. Independent code review approved; planning and design each passed observed desktop consumers and light/dark/320px catalogue scope. Root additionally checked actual four-record 320px clock comparison and sample/average table with no page overflow, lane heights 144/144/144/72, 13px secondary values, real activity map area 384 → 736 → 384 and navigation actions. Physical touch and all other legacy screens remain outside acceptance. Temporary responsive pages/tabs were removed. No commit, push or deployment.

## Reapply the reviewed ORider design system — club detail only

The latest user narrowed new application work to the shared club-ride detail page only. Preserve all pre-existing changes; do not newly modify personal-activity consumers. Same fixed planning/design rubric and ≥9.8 target apply independently; prior scores do not carry over automatically. Runtime scope is the provided four-record/three-person ride on localhost:5317, desktop and 320/390px, light/dark where available, record selection, distance/clock basis, zoom/reset, map-area controls and stable point-plus-average table.

Remaining bespoke presentation to remove: rider-selection button padding/shape/border/color overrides; comparison-table appearance duplicated in page CSS; Card padding/radius overrides. Reuse public shared ToggleButton/ToggleControls, DataTable, ChartValue, IconButton and existing map/chart controls. Record identity dots, raw point values, gray observed means, zero/missing behavior, stream authorization, viewport map highlight and camera state remain feature-owned. No data/calculation/backend changes and no commit/push/PR/merge/deployment.

Actual responsive follow-up found that one null in a coarse display bin could erase 10–14 minutes of otherwise valid samples. A 314-minute/one-second synthetic series with one missing sample every ten minutes reproduced the mobile disappearance. Club power/speed opt into run-preserving display sampling: keep per-run means and true gap boundaries, including two real endpoints for a short run. Other consumers retain conservative sampling by default. The 240-point contract remains a hard cap for conservative mode; run-preserving mode treats it as the mean-bin budget and adds actual topology points, rather than falsely claiming a universal hard cap. Point inspection, observed means, source clocks and map coordinates are unchanged.


Final club-only acceptance: independent planning **9.82/10** and design **9.82/10**, with no required findings. Design fixed weights: hierarchy 20%, component craft 25%, layout/rhythm 20%, chart/map 15%, responsive 10%, states/contrast/keyboard 10%; individual scores 9.8/9.8/9.9/9.8/9.8/9.8. Planning has five equal-weight criteria scored 9.8/9.9/9.8/9.8/9.8. These are current observed-scope reviews, not inherited broader catalogue scores.

Shared ToggleControls, DataTable/ChartValue, Section and existing map/chart primitives now define club appearance. Compact table identity columns, accessible hidden caption and shorter coordinate reservation remove redundant headings and empty space. All-off record selection removes stale range/point instructions and restores correctly. Club InfoTip triggers opt into accessible accent text without changing existing callers. Dark map routes use a canonical neutral casing token beneath their original record hues. Casing stays mounted with zero light-mode opacity, preserving real Mapbox layer order across theme changes.

Actual authenticated evidence covers four records/three people, desktop and 320/390px, full real-clock chart, zoom, point/gray average persistence, true zero versus missing values, all-off/restore and map-area 480→864→480. Fresh dark screenshots `club-ds-dark-map-casing-final.jpg` and `club-ds-dark-map-range-final.jpg` in the private `_tmp/club-ride-quality-20261019` evidence folder confirm tile contrast and selected-range emphasis. Browser media emulation became unavailable; final dark checks temporarily used a local source-only theme initializer, then restored the exact original file without changing stored user preferences. Temporary responsive HTML and tabs were removed.

Scoped suites pass (including final casing 30 tests and InfoTip 45 tests; overlapping suites are not summed). Full production build/typecheck, generated-token check, quality budget, ownership guard (126 frozen rules, zero new overrides), changed-file lint and diff checks pass. Independent code review covers the final stable-layer correction. Physical touch devices, full assistive-technology acceptance, nonempty photo permission states and personal-activity Gauge/Combo/zone migration remain outside observed acceptance. No commit, push, PR, merge or deployment.


Name and line-legibility follow-up: user rejected leading identity markers and thin chart traces. Club selection labels, chart legend and record links now use one shared SeriesLabel with record-colored underline; leading record dots/checks are removed while aria-pressed and selected button appearance remain. ChartLegend underline is opt-in and existing line/dot callers keep their defaults. Actual four-record hide/restore was rechecked.

The earlier design review missed how 1.5px metric-specific short dashes look at a five-hour range. Apple HIG does not mandate thin lines. Main club lanes now opt into a shared readable 2px width and solid lines; 0.8 opacity, 1px/0.18 background elevation, raw samples, gaps, sampling density, averages and selection behavior remain unchanged. Existing consumers keep their 1.5px default. Independent code review approved; independent designer confirmed the reported legibility issue resolved using fresh desktop/320/390px actual-record screenshots, without reusing the prior numeric score. Screenshots: club-name-line-desktop-final.jpg and club-name-line-mobile-final.jpg in the private evidence directory. Related suites 51/51 and 11/11 passed, changed-file lint and full production build/typecheck passed. Temporary responsive harness removed. No push/deployment.


Record selection from comparison table: a shared native Checkbox now precedes each activity link in the sticky identity cell. All activity rows stay present when unchecked, including all-off; unchecked rows explicitly say hidden and clear primary/average/sample values to avoid stale readings. The checkbox and link have separate targets. The existing visibleRiders state remains canonical for the top selector, map, chart and table. Shared selectable table width is opt-in; compact/default consumers are unchanged.

The record legend moved from below the title to immediately before the first chart lane, after chart controls and aggregation note. Only its labels are capped at four checked records; an ellipsis exposes the remaining count accessibly. All checked streams still render. Actual four-record desktop and 320/390px checks confirmed single-off, all-off with all four rows retained, table-based restoration, top-selector synchronization, sticky names and visible heart-rate column. Six-record cap/restore is regression-test evidence, not a claim about the four-record real ride. Relevant suite 64/64, changed-file lint, ownership guard and production build/typecheck passed. Independent code and focused design reviews passed with no required findings; earlier numeric scores were not reused. Private evidence: club-record-checkbox-desktop.jpg and club-record-checkbox-mobile.jpg. No external delivery.


Checkbox color follow-up: user requested record-colored checkboxes, removal of name underlines and right-aligned legend. Club now uses plain names in top toggles and table links; Checkbox opts into the same activity palette via native accent-color while the shared default remains the brand accent. Checked glyphs/native keyboard state remain intact. Legend uses record-colored dots and optional end alignment, preserving four-label ellipsis behavior. Actual desktop/320px hide/restore and computed palette colors verified; full build/typecheck, related 53 tests, ESLint, ownership and diff checks passed. Independent narrow code/design review found no required findings. Private evidence: club-colored-checkbox-final.jpg and club-colored-checkbox-mobile.jpg. No push/deployment.

## Range movement and interaction follow-up

The shared ChartRangeControls now provides select range, move range and reset. Moving is enabled after narrowing the viewport; dragging preserves its span and clamps at the full domain. Arrow keys move a quarter span and Home/End reach the bounds. Escape cancels a pending gesture. The catalogue uses the same control. The real four-record desktop route verified range selection, movement, keyboard bounds, reset, synchronized map highlight and interval table updates.

Moving previously changed Y-axis bounds and viewport-relative averaging bins. Pan now fixes Y bounds to include finite source extrema, uses a stable global sampling grid and batches pointer updates once per animation frame. Original samples, gaps, clocks and weighted table means remain unchanged. The 37 relevant tests, lint, ownership and production build passed. Independent review approved. Actual before/during/after desktop captures confirm constant span and Y bounds; they do not measure frame rate or physical touch.

Chart-adjacent explanations now opt into click-only InfoTip activation. Hover and mere focus do not open them; native keyboard activation, outside click and Escape remain available. Range selection draws an accent band and both endpoint guides across lanes, within the plot clip. Regression tests cover canvas drawing and cancellation. The latest browser connection stopped responding during responsive verification; the new tooltip/selection visuals and final mobile behavior have not received live acceptance. Earlier screenshots are not used as proof for this delta. Source design review found no additional required visual change. Final protected merge gates remain required for the new head.

Final code review approved after deferring the accent-color read to a cancellable animation frame, so parent theme effects apply current tokens first. The initial 39-test interaction run and the final 19-test renderer/adapter run passed, including theme ordering and canceled probes; these counts overlap. Final production build/typecheck passed (`built in 6.65s`). Lint, diff and ownership checks passed with the existing 126-rule baseline unchanged.

Protected merge verification at `5401417e` passed 793 affected test files / 8,523 tests, contracts, TypeScript and the full independent AI review. GitHub CodeQL also passed. The merge stopped because dev advanced concurrently and conflicted in MeetingTeams.test.tsx; these passing results are evidence for that head, not a completed merge or acceptance of a later resolution.
