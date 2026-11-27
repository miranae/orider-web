import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGS } from "./detector";
import { standaloneText } from "./standaloneText";

describe("standalone localized messages", () => {
  it("uses distinct translations and preserves the daily limit in all six languages", () => {
    const outputs = SUPPORTED_LANGS.map((locale) =>
      standaloneText(locale, "creator_hub_daily_generation_policy", { limit: "27" }),
    );
    expect(new Set(outputs).size).toBe(SUPPORTED_LANGS.length);
    for (const text of outputs) {
      expect(text).toContain("27");
      expect(text).not.toContain("{{");
    }
  });

  it("does not interpret placeholders in a user's question", () => {
    const question = "Compare {{period}} with my last ride.";
    for (const locale of SUPPORTED_LANGS) {
      const text = standaloneText(locale, "coach_clarification_period", { question, period: "2026-W48" });
      expect(text).toContain(question);
      expect(text).toContain("2026-W48");
    }
  });
});
