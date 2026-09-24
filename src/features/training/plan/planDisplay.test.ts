import { describe, expect, it } from "vitest";
import { formatPlanGoalTitle } from "./planDisplay";

describe("formatPlanGoalTitle", () => {
  it("separates generated year, event type, and distance from the visible goal name", () => {
    expect(formatPlanGoalTitle("2026_비앙키그란폰도춘천_그란폰도_122.91km")).toEqual({
      name: "비앙키그란폰도춘천",
      meta: "2026 · 그란폰도 · 122.91 km",
    });
    expect(formatPlanGoalTitle("2026_비앙키_그란폰도춘천_그란폰도_122.91km")).toEqual({
      name: "비앙키 그란폰도춘천",
      meta: "2026 · 그란폰도 · 122.91 km",
    });
  });

  it("keeps free-form titles unchanged", () => {
    expect(formatPlanGoalTitle("내 첫 100km 도전")).toEqual({ name: "내 첫 100km 도전", meta: null });
    expect(formatPlanGoalTitle("라이드_훈련")).toEqual({ name: "라이드_훈련", meta: null });
    expect(formatPlanGoalTitle("2026_훈련")).toEqual({ name: "2026_훈련", meta: null });
    expect(formatPlanGoalTitle("2026_훈련_100km")).toEqual({ name: "2026_훈련_100km", meta: null });
    expect(formatPlanGoalTitle("2026_훈련_그란폰도")).toEqual({ name: "2026_훈련_그란폰도", meta: null });
    expect(formatPlanGoalTitle("2026_훈련_라이드_100km")).toEqual({ name: "2026_훈련_라이드_100km", meta: null });
    expect(formatPlanGoalTitle("  내 첫 100km 도전  ")).toEqual({ name: "  내 첫 100km 도전  ", meta: null });
  });

  it("joins multiple generated name segments without changing the stored title", () => {
    expect(formatPlanGoalTitle("2026_내_훈련_그란폰도_100km")).toEqual({ name: "내 훈련", meta: "2026 · 그란폰도 · 100 km" });
  });
});
