import { describe, expect, it } from "vitest";

import { selectChartOverlay } from "./activityDetailDerived";

describe("selectChartOverlay", () => {
  it("keeps multi-metric comparison to two visible metrics and focuses the last selection", () => {
    const speed = selectChartOverlay(new Set(), "speed");
    const speedAndHr = selectChartOverlay(speed.activeOverlays, "hr");
    const powerReplacesSpeed = selectChartOverlay(speedAndHr.activeOverlays, "power");

    expect([...powerReplacesSpeed.activeOverlays]).toEqual(["hr", "power"]);
    expect(powerReplacesSpeed.focusedOverlayKey).toBe("power");

    const removesFocus = selectChartOverlay(powerReplacesSpeed.activeOverlays, "power");
    expect([...removesFocus.activeOverlays]).toEqual(["hr"]);
    expect(removesFocus.focusedOverlayKey).toBe("hr");
  });
});
