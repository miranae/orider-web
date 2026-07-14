import { describe, expect, it } from "vitest";
import {
  DISCIPLINE_CHART_COLORS,
  LOAD_FOCUS_COLORS,
  PMC_FUTURE_OPACITY,
  PMC_LINE_PALETTE,
} from "./chartPalette";

describe("fitness chart palette", () => {
  it("distinguishes PMC metrics by both token color and line pattern", () => {
    expect(new Set(Object.values(PMC_LINE_PALETTE).map((item) => item.color)).size).toBe(3);
    expect(PMC_LINE_PALETTE.ctl.dasharray).toBeUndefined();
    expect(PMC_LINE_PALETTE.atl.dasharray).toBe("7 4");
    expect(PMC_LINE_PALETTE.tsb.dasharray).toBe("1 4");
    expect(PMC_LINE_PALETTE.tsb.linecap).toBe("round");
  });

  it("uses one forecast opacity without changing each metric pattern", () => {
    expect(PMC_FUTURE_OPACITY).toBe(0.62);
    expect(Object.values(PMC_LINE_PALETTE).map((item) => item.dasharray)).toEqual([
      undefined,
      "7 4",
      "1 4",
    ]);
  });

  it("uses theme tokens for discipline and load-focus categories", () => {
    expect(new Set(Object.values(DISCIPLINE_CHART_COLORS)).size).toBe(3);
    expect(LOAD_FOCUS_COLORS).toEqual({
      baseAerobic: "var(--aqua)",
      highAerobic: "var(--amber)",
      highIntensity: "var(--rose)",
      unclassified: "var(--ink-3)",
    });
    expect(JSON.stringify({ DISCIPLINE_CHART_COLORS, LOAD_FOCUS_COLORS })).not.toContain("oklch(");
  });
});
