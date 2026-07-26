import { describe, expect, it } from "vitest";
import { coachRidePlanAiRequestSchema, coachRidePlanPinnedRequestSchema, isCoachRidePlanRespondToken,
  parseCoachRidePlan, parseCoachRidePlanAiProjection, parseCoachRidePlanToken } from "./coachRidePlanContract";

const contextToken = `ride2.${"a".repeat(100)}.${"b".repeat(43)}`;
const legacyContextToken = `ride1.${"d".repeat(100)}.${"e".repeat(43)}`;
const inputRevision = `ridein_${"c".repeat(24)}`;
const execution = { providerCalls: 0, quotaConsumed: false, writes: 0 };
const assumptions = { model: "cp-wprime-whole-course-v1", weather: "not_modeled", stops: "not_modeled",
  fueling: "not_generated", optimalSegmentPower: "not_generated" };
const segment = { index: 0, startDistanceM: 0, endDistanceM: 5_000, averageGradePct: 4,
  estimatedSpeedKph: 18.5, estimatedTimeSec: 973 };
const base = { schemaVersion: "coach-ride-plan-v1", status: "ok", contextToken, inputRevision,
  course: { distanceM: 5_000, elevationGainM: 200 },
  estimate: { totalTimeSec: 973, averageSpeedKph: 18.5 }, segments: [segment], assumptions,
  exampleQuestionCodes: ["HARDEST_SECTION", "PERSONAL_PACING"], execution };

describe("Coach Ride Plan backend contract", () => {
  it("strictly accepts the exact token and valid snapshot fixtures", () => {
    expect(parseCoachRidePlanToken({ data: { contextToken, inputRevision,
      expiresAt: "2026-07-27T00:15:00.000Z", secretVersion: "ride-plan-v2", execution } }))
      .toMatchObject({ contextToken, inputRevision, execution });
    expect(parseCoachRidePlan({ data: base })).toMatchObject({ status: "ok", segments: [{ estimatedTimeSec: 973 }] });
  });

  it("requires current ride2 for mint responses but retains ride1 only for the snapshot bridge", () => {
    expect(() => parseCoachRidePlanToken({ data: { contextToken: legacyContextToken, inputRevision,
      expiresAt: "2026-07-27T00:15:00.000Z", secretVersion: "ride-plan-v1", execution } })).toThrow();
    expect(parseCoachRidePlan({ data: { ...base, contextToken: legacyContextToken } }).contextToken)
      .toBe(legacyContextToken);
    expect(coachRidePlanPinnedRequestSchema.parse({ courseId: "private-course", contextToken: legacyContextToken }))
      .toMatchObject({ contextToken: legacyContextToken });
    expect(coachRidePlanAiRequestSchema.parse({ courseId: "private-course", contextToken: legacyContextToken,
      questionCode: "HARDEST_SECTION" })).toMatchObject({ contextToken: legacyContextToken });
    expect(isCoachRidePlanRespondToken(legacyContextToken)).toBe(false);
    expect(isCoachRidePlanRespondToken(contextToken)).toBe(true);
  });

  it.each(["missing_pdc", "missing_weight"] as const)("accepts the exact %s bounded snapshot", (status) => {
    expect(parseCoachRidePlan({ data: { ...base, status, estimate: null, segments: [] } }))
      .toMatchObject({ status, estimate: null, segments: [] });
  });

  it("rejects extra identity, coordinates, writes, question drift, and malformed revisions", () => {
    for (const data of [
      { ...base, courseId: "private-course" },
      { ...base, course: { ...base.course, latitude: 37.5 } },
      { ...base, execution: { ...execution, writes: 1 } },
      { ...base, exampleQuestionCodes: ["PERSONAL_PACING", "HARDEST_SECTION"] },
      { ...base, inputRevision: "ridein_bad" },
      { ...base, segments: [{ ...segment, rawPolyline: "private" }] },
    ]) expect(() => parseCoachRidePlan({ data })).toThrow();
  });

  it("rejects unknown token response fields and non-zero execution", () => {
    const token = { contextToken, inputRevision, expiresAt: "2026-07-27T00:15:00.000Z",
      secretVersion: "ride-plan-v2", execution };
    expect(() => parseCoachRidePlanToken({ data: { ...token, courseId: "private" } })).toThrow();
    expect(() => parseCoachRidePlanToken({ data: { ...token,
      execution: { ...execution, providerCalls: 1 } } })).toThrow();
  });

  it("strictly accepts only the privacy-safe AI projection", () => {
    const projection = { schemaVersion: base.schemaVersion, inputRevision, questionCode: "HARDEST_SECTION",
      course: base.course, estimate: base.estimate, segments: base.segments, assumptions };
    expect(parseCoachRidePlanAiProjection({ data: projection })).toMatchObject({ inputRevision,
      questionCode: "HARDEST_SECTION", segments: [{ index: 0 }] });
    for (const data of [{ ...projection, contextToken }, { ...projection, courseId: "private-course" },
      { ...projection, segments: [{ ...segment, latitude: 37.5 }] }, { ...projection, questionCode: "FREE_TEXT" }]) {
      expect(() => parseCoachRidePlanAiProjection({ data })).toThrow();
    }
  });
});
