# ORider web design-system quality loop

User target: independent senior-designer-role review, at least 9.8/10. This review concerns the web controls, map/chart presentation, live catalogue and their current activity/club consumers. Earlier ownership-migration approval is not a visual-quality score. No commit, push or deployment is authorized in this loop.

## Evaluation contract — fixed before revision

Planning and design are scored separately. Each must reach a weighted score of at least 9.8/10, with no core item below 9.5 and no required defect left open. Numbers are reviewer judgments supported by current observations, not objective certification or human review. Unknown states are marked unverified rather than assigned a passing score. Keep the same items and weights across rounds; do not raise scores to fit the target.

| Planning item | Weight |
| --- | ---: |
| Purpose and navigation | 20% |
| Selection guidance and ownership | 20% |
| Component states and composition coverage | 20% |
| Real interaction and recovery | 20% |
| Consistency with current product consumers | 20% |

| Design item | Weight |
| --- | ---: |
| Hierarchy and typography | 20% |
| Component craft and action anatomy | 25% |
| Layout, density and rhythm | 20% |
| Chart and map clarity | 15% |
| Responsive layout and long labels | 10% |
| States, contrast and keyboard focus | 10% |

Evidence: actual browser desktop, 320px and 390px previews; light/dark; selected/hover/focus/disabled/loading/empty states; functional fixture-based chart/map examples; current authenticated club/activity consumer regressions. All fixture content must be labeled. Physical-device touch and the other 126 frozen legacy overrides are outside this acceptance. Screenshots with private records remain outside the repository.

## Reference baseline — Apple HIG

Before round 1 authoring, the user replaced the proposed Material Design baseline with [Apple Human Interface Guidelines](https://developer.apple.com/kr/design/human-interface-guidelines/). The fixed rubric and weights above remain unchanged. This is a web interpretation, not native-platform certification. The subsequent user direction makes Apple the actual visual base, retaining ORider brand accent: system Apple-first typography, restrained neutral surfaces, control anatomy and spacing must reflect that baseline. Existing data semantics and web navigation remain functional contracts.

- [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): express action priority through style rather than neighboring size differences; concise labels, recognizable icons, press states and adequately spaced targets.
- [Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls): group related choices with consistent anatomy and clear selection. Keep actions separate from state selection.
- [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars): prioritize frequent commands, reduce competing borders/backgrounds and keep control meaning clear.
- [Charts](https://developer.apple.com/design/human-interface-guidelines/charts): marks lead; axes, units and labels provide context. Preserve wide plots, consistent alignment, keyboard inspection and available critical values without hover dependence.
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) and [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): clear hierarchy, adaptable layout, sufficient contrast in both themes, non-color state cues and alternatives to gestures.

Official linked Markdown content was retrieved directly from developer.apple.com on 2026-10-19. Apple system fonts are selected through the operating-system font stack; no Apple font files are redistributed. Decorative glass effects are not required for this web implementation.

## Round 0 — initial independent review

Planning: 5.5 / 7.0 / 6.0 / 5.0 / 8.5, weighted **6.4/10**. Missing navigation and adoption guidance; incomplete state coverage; zoom/axis/map examples change labels rather than geometry; cadence toggle does not add a lane.

Design: 7.2 / 7.1 / 6.5 / 5.5 / 7.2 / 6.8, weighted **6.78/10** (keyboard item provisional before live interaction). Oversized uniform cards and empty space; uninformative sm/md/lg examples; axis-free repeated chart paths; empty map; weak single-selection state and inconsistent control families. Required changes: coherent documentation hierarchy and component anatomy, state demonstrations, functional axis/range/selection examples, chart units and gaps, real route geometry with distinct area/camera controls, responsive alignment and visible keyboard focus.

## Round 1 — independent review and corrections

Planning provisional: 9.4 / 9.1 / 9.3 / 9.1 / 9.4, weighted **9.26/10**. Required corrections: accumulated distance must not imply the same road position; save completion belongs beside its control; adoption needs exact API/implementation paths and explicit migration limits. These were corrected. Standalone selection examples now have independent state, and working composition controls sit directly beside the chart.

Design: 9.8 / 9.8 / 9.8 / 9.2 / 9.8 / 9.4, weighted **9.67/10**, pending final consumer observations. Initial layout/control/map defects were resolved, but translucent series colors failed effective background contrast in both themes. Required correction: a common theme-specific record palette and composited contrast policy, preserving partial transparency and stable map/chart/legend identity. Full-range reset is now disabled unless range selection needs cancellation.

Runtime evidence so far: actual 320/390px catalogue has no document overflow (305/305 and 375/375 with classic scrollbar); 320px long label wraps; 390px dark state remains readable. Tab focuses the save button with a 2px outline; Enter reports aria-busy before adjacent completion feedback. Actual hover is present; holding Space applies active brightness(.96). Fixture zoom changes 0–32.4 km to 9.9–26.1 km, map highlights that range and observed means update. End/Left move selection; empty data renders dashes and restores. These observations do not constitute physical-device touch or full assistive-technology approval.

## Final round — accepted within the stated scope

Independent planning: **9.82/10** (9.8 / 9.8 / 9.8 / 9.9 / 9.8 in the fixed order). Independent senior-designer-role review: **9.815/10**, displayed **9.82/10** (9.8 / 9.9 / 9.8 / 9.8 / 9.7 / 9.8). Both meet the target; no core item is below 9.5 and no required defect remains. These are independent AI reviewer judgments, not human or Apple certification.

The common record palette now preserves theme-specific hue identity in map, chart, legend and table. At major-line opacity .8, all eight colors exceed 3:1 against the actual default page and plot backgrounds; minimum effective contrast is 3.52:1 light and 4.93:1 dark. Density remains 9px / maximum 240 points. Supporting elevation remains faint by intent.

Actual final observations: cadence adds an rpm lane; changing to actual time preserves record start differences; fixture zoom to 09:23–10:09 updates plot/map/means, and End selects the visible range end. Map camera scale changes 1→1.5→1 independently of area height 288→480→288. Clearing every metric retains only the subdued elevation context; restoring the three defaults works. Actual club 320px and activity 390px documents have clientWidth equal to scrollWidth (320/320, 390/390). The real four-record comparison keeps zero, missing values and gray observed averages distinct. Personal map area changes 386→738→386 through opposite corner controls.

Final private captures remain outside the repository under `_tmp/club-ride-quality-20261019`: `apple-ds-final-light.jpg`, `apple-ds-final-light-chart.jpg`, `apple-ds-final-dark-chart.jpg`, `apple-ds-final-club-table.jpg`, `apple-ds-consumers-mobile.jpg`, plus focus/hover/pressed/mobile-state evidence. Temporary responsive harness files and tabs were removed.

Independent code review: **APPROVE**. Chart registration now occurs only when ComparisonChart actually renders, rather than at barrel import. A real light→dark→light regression checks map, elevation, sensor lines and table color consistency without changing source coordinates.

Validation:
- Targeted 18-file suite: initial 154 passed / 1 failed because an older provider test required OKLCH spelling. Its assertions were changed to exact canonical token values, with no product-code workaround; corrected provider file passes 5/5. All 155 targeted cases are now covered by passing runs. Theme-switch metrics file separately passes 30/30.
- Hosting evidence tests: 3/3. Scoped changed-source ESLint: no errors or warnings.
- Full `npm run build` (including TypeScript): PASS, `/tmp/apple-ds-final-build.log`. App entry remains `assets/index-*.js`, catalogue has its own controls entry.
- `npm run quality:budget`: PASS; generated tokens current, ownership 126 frozen legacy rules / 0 new overrides. `git diff --check`: PASS.

No commit, push, PR, merge or deployment was performed. Physical-device touch, full assistive-technology acceptance and the frozen legacy overrides remain outside this review.

## Expansion — cards, sections, tables and a mixed-mark chart

The user requested more examples on 2026-10-19. Before authoring this expansion, keep the same planning/design rubric, weights and ≥9.8 threshold above. The previous accepted scores apply to the earlier scope, not automatically to these additions. Add current desktop, 320/390px, light/dark and interactive-state evidence for the new examples. No delivery authorization changes.

| Example | User decision and information role | Canonical expression and acceptance |
| --- | --- | --- |
| Cards | Which related content benefits from a distinct surface? | Existing Card variants with concrete use cases, readable heading/actions and consistent inset; avoid nested boxes. |
| Sections | How do related cards, text and actions form a topic? | Semantic section with title/description/actions and aligned content; retain heading hierarchy without another outer card. |
| Table | How can I compare exact values across records? | Descriptive column headings/units, numeric alignment, stable names, sorting, true zero versus missing, empty/loading and narrow horizontal navigation. |
| Mixed-mark chart | How do two different measures change over the same time? | One actual canvas with power bars and heart-rate line, two named unit axes, shared time, legend controls, keyboard inspection and stable exact values. Preserve gaps and zero; do not imply physiological causation. |

Additional official references: [Boxes](https://developer.apple.com/design/human-interface-guidelines/boxes), [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables), and the previously read Charts guidance. Use a small group surface for a real grouping purpose; use padding/alignment for internal relationships. Tables need descriptive headers and legible narrow layouts; meaningful sorting must change actual row order. New presentation belongs in shared components and its catalogue, not page-specific replicas.

## Expansion — activity analysis controls

The screenshot request adds metric toggles/fixed elevation legend, axis selection and range action, zone timelines, server calculation status, FTP reference gauge and CTL/ATL/TSB before/after plots. The same independent ≥9.8 planning/design rubric applies. Shared presentation owns appearance and geometry; feature adapters retain calculation, authorization, domain, units and server-state semantics. Actual load 127 and stored analysis TSS 37 remain distinct. Read-only runtime checks must not regenerate AI, recalculate or publish.

### Expansion review outcome — implementation complete; final runtime approval pending

Independent code review approved the analysis migration with no required defects. Its optional late-arriving rows observation was also fixed with a ResizeObserver connection regression. Planning and design reviewers required three corrections: timeline exact values needed keyboard/tap access, four status labels broke inside words at 320px, and ComboChart edge-padding ticks could render invalid time labels. All three are fixed and independently rechecked in source. Timeline has one focus target, arrow/Home/End navigation, click selection and a stable adjacent readout; metadata labels retain full accessible names; chart labels outside the data domain are suppressed without moving raw coordinates. The actual activity axis/range action alignment was corrected through shared Stack alignment.

Observed before the final corrections: actual activity streams, canonical load 127 versus stored TSS 37, IF 1.05, timeline and CTL/ATL/TSB values render; catalogue range selects 30–60min and updates values, pending renders a dash without a gauge, outside IF 1.44 retains its actual label with a clamped marker, ComboChart keyboard selection preserves 09:04:30. 320/390px catalogue light/dark analysis and gauge screenshots were inspected; document width equals scroll width at 320px (305/305 excluding scrollbar).

After the final corrections, browser automation repeatedly timed out and reset its connection, including existing/fresh binding and viewport recovery. Final visual and interaction acceptance for the corrected timeline, mobile labels, combo edge ticks, empty/loading table and actual aligned controls remains unverified. Both independent reviewers explicitly withhold final weighted scores; the earlier 9.82 scores do not apply to this expansion. No claim of ≥9.8 acceptance is made. These tooling failures are not evidence of a product failure or a passing state. Temporary responsive harness source was removed. No commit/push/PR/merge/deploy.

Validation evidence: full production build PASS in `/tmp/apple-analysis-final-build.log`; quality budget/tokens/ownership PASS in `/tmp/apple-analysis-final-quality.log` (126 frozen legacy overrides; 0 new). Scoped migration 126 tests, alignment 30 tests, core interaction 9 tests and catalogue lint pass in their respective `/tmp/activity-analysis-controls-*`, `/tmp/activity-range-alignment-*`, `/tmp/apple-analysis-interaction-*` logs. Final post-correction regression/typecheck are recorded separately.

Final post-correction targeted regression: 4 files / 41 tests PASS, `/tmp/apple-analysis-final-regression.log`. Final diff whitespace check PASS.
Final post-correction `npx tsc -b`: PASS (exit 0), `/tmp/apple-analysis-final-typecheck.log`.

## Surface refinement — Apple-inspired depth, 2026-10-19

User approved subtle gradient/highlight on common buttons and within power zones. Maintain the fixed review rubric and existing data meaning. Use canonical theme-aware surface tokens and shared presentation only: no inter-zone color interpolation, no changed widths/values/legend, no new page-level button styles. Plain controls retain their low hierarchy, and disabled/focus/pressed states remain distinguishable. This is a web surface treatment inspired by Apple HIG, not native Liquid Glass.

### Detailed official-guidance comparison

The user's follow-up explicitly requested control-by-control comparison. See [Apple control audit](apple-control-audit.md) for 22 control groups, official references, observed implementation, intentional ORider web adaptations and open findings. An independent designer reviewed the document for factual overstatement; corrections include primary semibold weight and secondary hover contrast. HIG does not universally require gradients, capsule shapes or single-select-only segmented controls. Native pt sizing is distinguished from ORider CSS-pixel policy.

Actual inspection confirmed the internal vertical sheen on the real 7-zone fallback bar chart and stable timeline readout. Open audit follow-ups remain explicit: visible narrow-chart domain endpoints, the reference gauge's accessible domain/reference contract and direct labels for all seven power zones. These were identified during comparison, not silently counted as passed. Button normal/hover/pressed text contrast was found inadequate in several prior tokens and is being corrected with theme-relative control-only tokens while preserving global brand/zone colors.

Final surface validation: control-only fill/text tokens now derive from the active theme accent/error; no fixed default hue is imposed on another theme. Both default and app-parity light/dark, normal/hover/pressed were calculated over 501 sheen positions with pressed foreground brightness included; lowest recorded ratio is 4.660:1. This is a conservative sRGB clipping calculation, not a full device accessibility certification. Final normal-state light/dark captures: `surface-buttons-final-light.jpg` and `surface-buttons-final-dark.jpg`. Post-correction tests 3 files/14 PASS; quality/tokens/ownership PASS; independent code review APPROVE for the surface implementation; latest full `npm run build` PASS (`/tmp/apple-surface-final-build.log`). Temporary harness and its tab were removed. No commit/push/PR/merge/deploy. The three audit readability/accessibility follow-ups remain open and no final ≥9.8 score is claimed.
