import { describe, expect, it } from "vitest";

import { classifyLane, LANE_ORDER } from "./waypointLanes";

describe("waypointLanes", () => {
  it("classifies visible course markers", () => {
    expect(classifyLane({ type: "FOOD", name: "Aid" })).toBe("AID");
    expect(classifyLane({ type: "GENERIC", name: "2차 보급" })).toBe("AID");
    expect(classifyLane({ type: "KOM", name: "Hill" })).toBe("KOM");
    expect(classifyLane({ type: "GENERIC", name: "정상 체크" })).toBe("KOM");
    expect(classifyLane({ type: "CUT", name: "Cutoff" })).toBe("CUT");
    expect(classifyLane({ type: "GENERIC", name: "3차 컷" })).toBe("CUT");
    expect(classifyLane({ type: "GENERIC", name: "Segment 1" })).toBe("SEG");
  });

  it("keeps the display order stable", () => {
    expect(LANE_ORDER).toEqual(["KOM", "AID", "CUT", "SEG"]);
  });
});
