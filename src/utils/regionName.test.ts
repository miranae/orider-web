import { describe, expect, it } from "vitest";
import { formatSegmentRegion, localizeRegionName } from "./regionName";

describe("regionName", () => {
  it("localizes known segment regions for Korean screens", () => {
    expect(localizeRegionName("Seoul", "ko")).toBe("서울");
    expect(localizeRegionName("North Chungcheong", "ko-KR")).toBe("충청북도");
    expect(formatSegmentRegion("Danyang-gun", "Chungcheongbuk-do", "ko")).toBe("단양군 · 충청북도");
  });

  it("keeps source names for non-Korean screens", () => {
    expect(formatSegmentRegion("Danyang-gun", "Chungcheongbuk-do", "en")).toBe("Danyang-gun, Chungcheongbuk-do");
  });
});
