import { describe, expect, it } from "vitest";
import { coachRoute } from "./coachRoute";
describe("coach route sport continuity", () => {
  it("preserves an anchor and existing parameters when changing sport", () => {
    expect(coachRoute("/coach/condition?range=90&sport=bike#thresholds", "run"))
      .toBe("/coach/condition?range=90&sport=run#thresholds");
  });
  it("adds the sport to a saved conversation and setup route", () => {
    expect(coachRoute("/coach/chat/thread", "run")).toBe("/coach/chat/thread?sport=run");
    expect(coachRoute("/goal-setup", "run")).toBe("/goal-setup?sport=run");
  });
});
