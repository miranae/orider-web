import { describe, expect, it } from "vitest";
import en from "../../i18n/resources/en/training.json";
import ko from "../../i18n/resources/ko/training.json";

const readinessSignals = ["readiness", "readiness_rhr", "readiness_hrv", "readiness_sleep", "readiness_stale"] as const;

describe("prescription confidence gap translation parity", () => {
  it.each([ko, en])("defines the warning copy and every readiness signal label", (resource) => {
    expect(resource["decision.confidenceGap.title"]).not.toBe("");
    expect(resource["decision.confidenceGap.body"]).not.toBe("");
    for (const signal of readinessSignals) {
      expect(resource[`decision.checkIn.signal.${signal}`]).not.toBe("");
    }
  });
});
