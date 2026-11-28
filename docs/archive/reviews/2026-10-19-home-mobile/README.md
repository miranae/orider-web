# Mobile home quality review — 2026-10-19–20

## Scope and current decisions

Worktree: `orider-web-home-mobile-quality-20261019`, branch `fix/home-mobile-quality-20261019`. Preview: http://localhost:5331/ko. This work is local only. The user explicitly requires no push without a new request. No commit, push, PR, merge or deployment has been performed for this task.

Mobile Home prioritizes discovering activities and social interaction. Preserve desktop content and unique information when moving mobile summaries.

| Information/action | Purpose and scope | Final position |
|---|---|---|
| Activity feed and social actions | Read, discover and interact | Primary Home flow |
| Recent seven days | Exact rolling period; canonical all sports versus legacy selected sport | My Activities, mobile authenticated activity-list tab only; not calendar month totals |
| Today/goals/condition | Personal training management | Existing Coach destinations |
| Monthly flow and run weekly recap | Unique interpretation with distinct periods and coverage | Mobile Coach analysis; preserve all-sport/run labels, eight-week recap history and Seoul timing |
| Running contribution to integrated fitness | Explain cross-discipline contribution | Mobile Coach condition, reusing existing fitness data |
| Upcoming registered events | Find joined events | Stable supporting Home notice after first activity or empty-feed support |
| Annual records | Reach personal annual recap | One contextual CTA; exclude anonymous users |
| Strava setup | Manage activity imports | Existing connection settings and contextual running onboarding; remove standalone Home link |
| Account/language/legal links | Personal and supporting navigation | Mobile avatar opens existing account drawer; remove adjacent signed-in three-line button |
| Search and filters | Narrow activities while retaining visible context | One filter trigger; expanded row described below |

## Final Home flow

- Remove the large visible Home h1 and signed-in empty header padding. Retain an assistive-technology h1. Guest explanation/login remain.
- Remove permanent sport toggles and separate search trigger. One filter button aligned to the right of the activity-feed heading opens or closes the panel.
- Put search text, audience, period and sport in a single horizontal row without external labels, using the user-requested 3:1:1:1 column ratio (3:1:1 for guests without audience selection). Sport choices are All/Cycling/Running/Swimming; default is All. Show category and selected value inside each filter (공개전체/조회전체/종목전체), and retain accessible names; the search input retains its placeholder. A trailing search-submit button inside the input and Enter/mobile keyboard search submit the existing form.
- Closing the panel preserves query and selections. Show applied conditions in the existing summary. Opening focuses the input; closing/Escape returns focus to the filter trigger. Preserve search reset, retry, pagination and composition paths.
- Activity cards show actual start time as localized Today/Yesterday or calendar date plus time, with semantic `time` markup. Optionally show stored `sourceMeta.deviceModel`; omit empty separators. Locality is absent from the current Activity contract, so do not infer it or add geocoding/queries. Emphasize activity titles with the shared subtitle role.
- Mobile header omits standalone gear settings and creation controls. Keep desktop controls and settings in the account menu. Signed-in mobile avatar reuses the existing drawer, including language/legal/support links; guests retain their menu entry. Resize dismissal pops the temporary drawer history entry rather than leaving a duplicate visit.

## Data and behavior safeguards

Canonical recent-summary provenance, coverage, stale/pending/error/known-zero states and units remain distinct. Owner changes discard previous-owner state; sport changes do not remount an unchanged all-sport canonical controller. My Activities mounts the summary only in list mode.

Mobile Home no longer subscribes to unused personal weekly/canonical/fitness summaries. Keep queries required by running onboarding and setup messages. Upcoming-event query ownership remains stable across first-record changes, filtering, search and loading; cancellation while waiting for App Check prevents the follow-up callable read.

## Shared design system

Apply only the verified shared deltas from the updated design-system worktree: responsive Section actions, ChartTooltip alignment/wrapping, static SegmentTimeline distributions, shared DisciplineTabs and mobile tab-label containment. Preserve role-aware toggle semantics and the mobile Input/Select 48px target and 16px input-font guard. Shared appearance stays in `src/theme/components/`; the frozen ownership baseline remains 126 legacy rules with zero new overrides.

`Select variant="filter"` is additive: neutral `bg-2`/`ink-1`, `r-lg`, compact token padding, native picker and keyboard behavior, focus-visible accent outline and invalid-state priority. Ordinary Select callers retain their current appearance. Documented in both theme/component READMEs and the control catalogue. Apple pop-up-button guidance supports using a mutually exclusive selection control; this web adaptation is not a claim of native Apple rendering or certification.

## Independent review

| Lane | Verdict and scope |
|---|---|
| Planning | Source PASS: feed priority, unique-content destinations, period meaning and account-entry consolidation |
| Design-system consistency | Source PASS: shared controls, hierarchy, state, focus and ownership |
| Code/data behavior | APPROVE: final single-panel state preservation, native selection, search paths, shared-variant compatibility and history cleanup; no remaining code finding |
| Actual visual/touch acceptance | Unverified: browser connection timeouts prevent current 320/390px, English, native picker, real IME and authenticated-journey acceptance; no numeric visual score |

Known narrow-width limitation: the user requires four fields on one row. At 320px, long English selected values such as Friends may be clipped inside the control; full applied conditions remain in the summary. Do not report narrow English control readability as approved without rendered evidence.

## Final automated evidence

- Latest four-field change: 3 suites / 79 tests passed (MobileFeedPage, Dashboard running journey, shared components).
- Latest account resize/history change: TopNav 7 tests passed; prior account/layout/feed integration passed 74 tests. These counts overlap and must not be summed.
- Activity timestamp/date/cancellation checks passed 68 tests before the final toolbar change; broad summary/query-gate reassembly passed 237 tests before later presentation changes. These are scoped earlier evidence, not new final-suite totals.
- Latest scoped ESLint: zero errors/warnings. Token check, ownership (126 legacy / zero new) and diff checks passed.
- The four-field `npm run build` passed, including TypeScript and production bundling (`built in 7.09s`): `/tmp/orider-home-mobile-four-field-final-build.log`. The final 3:1:1:1 CSS-only adjustment is validated separately below.
- Final `npm run check:i18n` passed English/Korean coverage: `/tmp/orider-home-mobile-four-field-final-i18n.log`.

The earlier full build caught two stale All comparisons during the temporary two-sport stage; these were fixed before the final build. Actual rendered acceptance remains separate from the automated results above. Do not reuse earlier screenshots or scores as evidence for this implementation.

Final user-specified ratio-only follow-up: production build and TypeScript passed (`built in 6.58s`), `/tmp/orider-home-mobile-ratio-final-build.log`; diff check passed. No new mirrored cosmetic test was added for this grid-ratio change.

Latest label follow-up: remove visible external labels; use contextual option text inside native selects and retain aria-label names. The 3:1:1:1 ratio and all filter/search behaviors remain unchanged. Final validation follows after this wording update.

Final inline-label follow-up: independent code review approved preserved accessibility/form/filter semantics; 2 suites / 65 tests, scoped lint, i18n coverage and diff checks passed. `npm run build` passed including TypeScript and production bundling (`built in 6.55s`), `/tmp/orider-home-mobile-inline-label-final-build.log`. Local only; no commit or push.

Search execution follow-up: add a trailing submit action inside the shared Input, preserving the 3:1:1:1 outer grid and existing form behavior. Reserve input text space for the action, keep its touch target and preserve Input refs/accessibility/default callers. This is an execution action, not another search-disclosure trigger. Validation is separate from the previous inline-label pass.

Trailing search-submit final checks: independent design-system source and code review passed; 3 suites / 80 tests, scoped lint, i18n coverage, ownership and diff checks passed. Production build including TypeScript passed (`built in 6.59s`), `/tmp/orider-home-mobile-submit-final-build.log`. A fresh browser inventory retry also timed out, so real rendering remains unverified. The user-requested 3:1:1:1 ratio can clip native selected labels at 320px; do not claim narrow-screen visual acceptance. No commit or push.

Reference-image layout follow-up: move the filter trigger into the feed-title row, remove the former empty tool row, and replace the right-hand sport badge with a neutral sport icon beneath the author avatar. Align author, timestamp and activity title in the adjacent content column while preserving indoor identification, warnings and all following card content. No user reference image or personal screenshot is copied into the repository.

Reference-image follow-up checks: independent source design/code reviews approved the title-row filter and avatar sport rail, preserving links, metadata, indoor identification and following card content. Two suites / 65 tests, scoped lint, ownership and diff checks passed; production build including TypeScript passed (`built in 6.61s`), `/tmp/orider-home-mobile-avatar-rail-final-build.log`. Afterwards the reviewer-recommended standalone separator before the indoor label was removed as punctuation-only polish. Rendered ORider acceptance remains unverified. No commit or push.

Latest icon follow-up: user-provided colored pixel sheet replaces the rejected equipment drawings. Home uses40px icons beneath avatars (previously32px). Crops now exclude dashed frames on both sides and size captions. Actual component renders at40px/light/dark were checked;73targeted tests, scoped ESLint, ownership and diff checks passed, and independent API review approved. See `sport-icons.md` for the remaining light-detail alpha limitation. This is local only; no commit/push and no new9.8/page-wide acceptance claim.

Final40px production build passed including TypeScript and bundling (`built in21.73s`), `/tmp/home-pixel-sport-40-build.log`.
