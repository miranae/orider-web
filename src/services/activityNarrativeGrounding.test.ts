import { describe, expect, it } from "vitest";
import { validActivityNarrativeGrounding } from "./activityNarrativeGrounding";
const block = { kind: "coach_history", basis: "activity_relative", window: { fromMs: 1000, toMs: 2000, fromInclusive: false, toExclusive: true }, comparisonWindows: [], scanLimit: 24, scannedCount: 24, selectedCount: 20, missingCount: null, capReached: true, coverage: "sample", sources: [{ kind: "activity", activityId: "prior", revision: "saved-version" }], sourceCount: 1, sourcesTruncated: false, sourceSetDigest: "digest" };
const evidence = { version: 1, generatedAt: 3000, blocks: [block] };
describe("generation-time narrative evidence validation", () => {
  it("accepts explicit unknown missing counts without inferring a denominator", () => expect(validActivityNarrativeGrounding(evidence, 3000)).toBe(true));
  it.each([undefined, null, { ...evidence, generatedAt: 4000 }, { ...evidence, blocks: [{ ...block, window: { ...block.window, toMs: Infinity } }] }, { ...evidence, blocks: [{ ...block, selectedCount: NaN }] }, { ...evidence, blocks: [{ ...block, sourceCount: 0 }] }])("withholds malformed or unmatched evidence", (value) => expect(validActivityNarrativeGrounding(value, 3000)).toBe(false));
});
