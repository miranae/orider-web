# Rear sport icon design loop

User goal: a slight rear three-quarter view moving from lower left to upper right, energetic and joyful rather than fleeing. Increase the previous 18px Home-card glyph to 32px. Preserve the existing side-view icons outside this Home opt-in.

## Fixed evaluation contract

Evaluate actual rendered SVG artwork at 32px (Home use), 24px and 18px, on light and dark backgrounds, with enlarged geometry for diagnosis. Each axis has equal weight, 20 points; sum divided by ten gives the overall score out of ten. Per-axis scores are also reported out of ten for the minimum gate.

1. Immediate cycling/running/swimming recognition.
2. Lower-left to upper-right direction and visible rear three-quarter perspective.
3. Light, energetic movement without fleeing or threatening posture.
4. Clear small-size silhouettes and separated details, led by actual 32px use.
5. Consistent line weight, optical scale and shape language across all three icons.

Pass requires overall >=9.8/10, every axis >=9.5/10, and all mandatory conditions (direction, rear perspective, intended mood and 32px recognition) met. Keep the same contract for every revision; do not inflate scores to satisfy the target. The author does not independently approve their own art. This score covers the rendered icon assets, not the whole page or real browser acceptance.

The temporary renderer uses the exact exported SVG geometry and resvg-js outside the project. It adds no production dependency or package-lock change. Preview artifacts remain under `/tmp/orider-sport-icon-preview/`.

## Draft 01 — REVISE, 6.5/10

Independent designer inspected `/tmp/orider-sport-icon-preview/draft-01.png` (light/dark, actual 32/24/18px and enlarged art).

| Axis | Score /20 |
|---|---:|
| Recognition | 14 |
| Direction and rear perspective | 11 |
| Energetic mood | 13 |
| Small-size clarity | 12 |
| Family consistency | 15 |

Rear perspective was not met; swimming was not reliably recognized at 32px. Bicycle frame/legs merge into a central knot, the runner suggests three legs, and the swimmer reads as jumping above the water. Simplify overlapping bike structure, draw exactly two runner legs and a clearer back, and lay the swimmer along a long horizontal/diagonal axis with clear reach/recovery arms.

## Draft 02 — REVISE, 7.9/10

Independent review of the new actual PNG (`draft-02.png`) scored recognition 17, perspective 13, mood 16, clarity 16 and family 17 out of 20 each. Swimming recognition and the runner's two-leg silhouette improved. Mandatory rear perspective still failed: the set reads primarily as side symbols tilted diagonally. Bicycle central overlaps remain, runner front-leg/torso boundaries merge at 18px, and the swimmer's pointed body reads as a board. Next revision must strengthen visible back/asymmetric shoulders and real perspective rather than just thin the lines.

## Draft 03 — REVISE, 8.7/10

Actual `draft-03.png` scored recognition 18.5, perspective 16.5, mood 17.5, clarity 17 and family 17.5 out of 20 each. The bicycle now has legible rear-wheel perspective; 32px is clearly visible. Running remains ambiguous between rear/front/side and swimming still lacks enough rear anatomy, so mandatory perspective is not fully met. Separate bicycle hand/handlebar from front wheel, move the runner head toward the far shoulder and lower the nearer shoulder, and taper the swimmer hips toward the submerged rear rather than drawing a board-like oval.

## Draft 04 — REVISE, 9.0/10

The independent review scored 18.7/17.8/18.2/17.8/17.5 out of 20. Recognition and separation improved, but rear perspective was still only borderline for running/swimming and optical weight differed. This was not acceptance. The initial draft-04 preview was subsequently overwritten during an exploratory metric render, so that file must not be used as the retained evidence for this historical score. Starting with draft-07, renderer output is immutable and paired with an artwork snapshot and SHA-256 manifest.

## User clarification and Draft 06 — REVISE, 8.7/10

The user explicitly rejected the apparent lack of perspective, clarified movement from 7 o'clock near the viewer toward 2 o'clock farther away, and asked for forward progress. These clarify the existing mandatory rear-perspective/mood criteria; they do not lower the pass threshold.

Draft 05 was an unreviewed intermediate. Actual draft-06 scored 18/16.5/18/17.5/17 out of 20: foreground/background opacity alone did not establish true rear geometry. Running still read primarily as a side runner and the swimmer separated from a fading waterline. Retain a clear waterline and differentiate the across-shoulder axis from the travel axis.

Draft 07 uses a NW–SE across-shoulder axis and a SW–NE travel axis with near/far anatomical occlusion. Its actual artifact and source snapshot are fixed under `/tmp/orider-sport-icon-preview/draft-07*`; independent review is pending.

## Draft 07 — REVISE, 8.9/10

Frozen actual PNG scored 17.8/18/17.8/17.5/17.9 out of 20. Rear geometry improved for bicycle and runner, but the swimmer again resembled a runner above waves and the runner's far leg collapsed into a small triangle. Restore distinct sport anatomy while keeping the new projection.

## Draft 08 — REVISE, 9.2/10

Frozen actual PNG scored 18.8/18.2/18.6/18/18.4 out of 20. Swimming and two-leg running recognition recovered and positive progress was clear. Small far details remained too faint: strengthen far-side opacity, enlarge the front-wheel opening and soften angular torso endings. Neither the overall 9.8 nor every-axis 9.5 gate is satisfied yet.

## Later drafts and superseding user artwork

Draft09 scored9.4; draft10 scored9.55. Draft11 was an unreviewed intermediate. The user supplied a specific rear-view cycling reference; draft12 scored9.1, draft13 scored9.35. Draft14 matched outlined backs and filled hips across the family and introduced an18/24px bicycle optical variant selected by the same pure function used by the component and renderer.

Independent designer judged frozen `/tmp/orider-sport-icon-preview/draft-14.png`9.8 overall: recognition9.9, rear perspective9.8, mood9.8, clarity9.7, family9.8. Source SHA256: `a77fa49ffa15732e5b64ee5418189847eb0bbc84c6af1f015d660cb9a2b05561`. This passed the asset-only contract. Independent source review also approved default-side compatibility, accessibility and zero clipping. Two targeted suites60tests, ESLint, ownership and production build passed before the following user override.

The user then explicitly chose uploaded bicycle/shoe artwork instead of the authored silhouettes, and supplied a replacement bicycle image with disc brakes. This decision supersedes the prior Home bicycle/running art. The9.8 score applies to draft14 only and must not be attributed to the uploaded replacements. Keep exact uploaded raster sources and remove their bright checkerboard only in the display layer, preserving the user's geometry. Swimming retains the earlier icon because no replacement was supplied. Real page rendering remains unverified because the browser connection is unavailable.

## Small-size equipment simplification

Subsequent user feedback rejected the flattened front wheel and the appearance of the detailed raster artwork at small sizes. The latest instruction explicitly prioritizes simplified small-size artwork. Replace the interim raster crop/filter wrapper with original code-native equipment SVG silhouettes: road bicycle, MTB, stationary bicycle, running shoes and trekking boots; retain swimming. Remove rotors, spokes, tread, laces and ground lines rather than shrinking illustration detail into32px. Keep a naturally open front-wheel oval and visible near/far wheel scale. The interim raster assets are removed from the repository; generated cutouts are not adopted.

Activity mapping remains a display-only layer: indoor bicycle uses existing trainer/VirtualRide criteria for bike activities; MountainBikeRide/EMountainBikeRide use MTB; Hike uses trekking. Walk/TrailRun/VirtualRun remain run, and unrelated activities retain the neutral fallback. Canonical discipline, summaries and filtering are unchanged. Screen-reader labels use the displayed subtype for trekking/MTB/indoor cycling.

The first hand-authored simplified equipment set (`equipment-simple-01.png`) was rejected by the user for poor drawing quality before independent review. It has no acceptance score and must not be presented as an approved9.8 design. SVG coordinate authoring is paused. A new reference-based professional image preview is being prepared for visual assessment before adoption. Subtype mapping13tests passed; this proves selection semantics only.

After the user rejected the drawing quality, the hand-authored equipment component was disconnected from Home. Home temporarily uses the established Material side icons at32px. The generated equipment preview also remains unapproved: trekking and running footwear are insufficiently distinct and the stationary bike is still too detailed. No new9.8 acceptance is claimed. The replacement equipment-icon task is incomplete; subtype mapping and accessibility labels are retained. No commit or push.

## User-provided pixel icon sheet — local40px application

The user supplied a finished colored pixel icon sheet (`src/assets/sport-pixel-reference.png`,688×184). Home now displays its five cropped equipment types rather than the rejected hand-authored shapes. Following another user request, the wrapper and Home use40px instead of32px. Source crop excludes both left and right dashed frames and bottom size captions: x=CELL_X+4,width108,y33,height116 within each120×120viewBox. Exact component SVG renders on light/dark at actual40px were inspected and no dashed frame remains. API compatibility review approved40px/default/clip changes.73targeted behavior tests, scoped ESLint, ownership and diff checks passed. This is not a page-wide visual approval or9.8score.

Known fidelity limitation: the temporary luminance background-removal filter also reduces alpha of very light artwork details on dark backgrounds. This remains distinct from the fixed border-crop issue and40px size request. Actual authenticated browser acceptance remains unverified. No commit or push.
