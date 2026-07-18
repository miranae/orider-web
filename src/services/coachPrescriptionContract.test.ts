import { describe, expect, it } from "vitest";
import fixture from "../features/coach/__fixtures__/p2-web-fixture.json";
import { coachPrescriptionCheckInRequestSchema, parseCoachPrescription, parseCoachPrescriptionCheckInResponse } from "./coachPrescriptionContract";

describe("coachPrescriptionContract", () => {
  it("accepts the byte-identical backend web fixture and preserves all seven actions", () => {
    const parsed = parseCoachPrescription(fixture);
    expect(parsed.nextDays.map((day) => day.action)).toEqual([
      "rest", "rest", "recovery", "reassess", "modified_workout", "reassess", "modified_workout",
    ]);
    expect(parsed.nextWeekLoad).toMatchObject({ minTss: 200, maxTss: 250 });
    expect(parsed.providerCalls).toBe(0);
    expect(parsed.quotaConsumed).toBe(0);
  });

  it("fails closed on evidence, status and charge drift", () => {
    for (const mutate of [
      (value: Record<string, any>) => { value.nextDays[0].evidenceIds[0] = "missing_evidence"; },
      (value: Record<string, any>) => { value.status = "safety_blocked"; },
      (value: Record<string, any>) => { value.providerCalls = 1; },
      (value: Record<string, any>) => { value.quotaConsumed = 1; },
    ]) {
      const tampered = structuredClone(fixture) as Record<string, any>; mutate(tampered);
      expect(() => parseCoachPrescription(tampered)).toThrow();
    }
  });

  it("requires UUID-bound check-in requests and zero-charge responses", () => {
    const request = { requestId: "018f47a2-3c4d-7abc-8def-000000000301", parentRequestId: "018f47a2-3c4d-7abc-8def-000000000201",
      checkInToken: "t".repeat(64), answers: { subjectiveFatigue: "tired", soreness: "present", painOrIllness: true } };
    expect(coachPrescriptionCheckInRequestSchema.parse(request).answers).toEqual(request.answers);
    expect(() => coachPrescriptionCheckInRequestSchema.parse({ ...request, requestId: "not-a-uuid" })).toThrow();
    expect(() => parseCoachPrescriptionCheckInResponse({ data: { status: "ok", prescription: fixture,
      providerCalls: 1, quotaConsumed: 0 } })).toThrow();
  });
});
