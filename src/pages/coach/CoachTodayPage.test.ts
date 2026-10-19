import { describe, expect, it, vi } from "vitest";
import type { TodayTrainingDecisionState } from "../../hooks/useTodayTrainingDecision";
import { canUseTodayHelpers } from "./CoachTodayPage";
const now = Date.parse("2026-10-14T10:00:00Z");
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../__tests__/fixtures/trainingDecision";
const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
const ready: TodayTrainingDecisionState = { loading: false, unavailable: false, scheduledOnly: false, unavailableReason: null, refresh: vi.fn(), decision: { ...decision, healthGate: { ...decision.healthGate, state: "clear" }, scheduledProjectionValidUntil: now + 3600000 } };
describe("today helper health gate", () => {
  it("requires a fresh clear authoritative decision", () => {
    expect(canUseTodayHelpers(ready, now, "bike")).toBe(true);
    expect(canUseTodayHelpers(ready, now, "run")).toBe(false);
    expect(canUseTodayHelpers({ ...ready, loading: true }, now, "bike")).toBe(false);
    expect(canUseTodayHelpers({ ...ready, unavailable: true }, now, "bike")).toBe(false);
    expect(canUseTodayHelpers({ ...ready, decision: null }, now, "bike")).toBe(false);
    expect(canUseTodayHelpers(ready, now + 3600000, "bike")).toBe(false);
    expect(canUseTodayHelpers({ ...ready, decision: { ...ready.decision!, healthGate: { ...ready.decision!.healthGate, state: "stop" } } }, now, "bike")).toBe(false);
  });
});
