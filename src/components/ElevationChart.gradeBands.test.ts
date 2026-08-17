import { describe, expect, it } from "vitest";

import { gradeBandIndex, readGradeBandColors, segmentGradePct } from "./ElevationChart";

describe("segmentGradePct", () => {
  it("거리 대비 고도차를 백분율로 낸다", () => {
    expect(segmentGradePct({ distance: 0, elevation: 0 }, { distance: 100, elevation: 5 })).toBe(5);
    expect(segmentGradePct({ distance: 0, elevation: 100 }, { distance: 1_000, elevation: 20 })).toBe(8);
  });

  it("내리막도 가파름으로 본다 — 색은 경사의 세기를 뜻한다", () => {
    expect(segmentGradePct({ distance: 0, elevation: 50 }, { distance: 100, elevation: 40 })).toBe(10);
  });

  it("거리가 0이거나 뒤로 가면 0으로 본다", () => {
    expect(segmentGradePct({ distance: 100, elevation: 0 }, { distance: 100, elevation: 50 })).toBe(0);
    expect(segmentGradePct({ distance: 100, elevation: 0 }, { distance: 50, elevation: 50 })).toBe(0);
  });
});

describe("gradeBandIndex", () => {
  it("3% 미만·3~7%·7% 이상 세 구간으로 나눈다", () => {
    expect(gradeBandIndex(0)).toBe(0);
    expect(gradeBandIndex(2.9)).toBe(0);
    expect(gradeBandIndex(3)).toBe(1);
    expect(gradeBandIndex(6.9)).toBe(1);
    expect(gradeBandIndex(7)).toBe(2);
    expect(gradeBandIndex(30)).toBe(2);
  });
});

describe("readGradeBandColors", () => {
  it("구간 수만큼 색을 돌려주고 서로 다르다", () => {
    const colors = readGradeBandColors(true);
    expect(colors).toHaveLength(3);
    expect(new Set(colors).size).toBe(3);
    expect(colors.every((color) => color.length > 0)).toBe(true);
  });

  it("라이트·다크에서 각각 값을 낸다", () => {
    expect(readGradeBandColors(false).every((color) => color.length > 0)).toBe(true);
  });
});
