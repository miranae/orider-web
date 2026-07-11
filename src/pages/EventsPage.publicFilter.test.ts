import { describe, expect, it } from "vitest";
import { isPublicEventInfo, matchesDatePreset } from "./EventsPage";

describe("isPublicEventInfo", () => {
  it.each(["OPEN", "LIVE", "FINISHED"])("allows public %s events", (status) => {
    expect(isPublicEventInfo({ status, visibility: "PUBLIC" })).toBe(true);
  });

  it.each(["DRAFT", "CANCELLED", "UNKNOWN"])("rejects %s events from the public list", (status) => {
    expect(isPublicEventInfo({ status, visibility: "PUBLIC" })).toBe(false);
  });

  it.each(["PRIVATE", "GROUP", undefined])("rejects %s visibility from the public list", (visibility) => {
    expect(isPublicEventInfo({ status: "OPEN", visibility })).toBe(false);
  });

  it("rejects soft-deleted events even when status and visibility look public", () => {
    expect(isPublicEventInfo({ status: "OPEN", visibility: "PUBLIC", deletedAt: 1 })).toBe(false);
  });
});

describe("matchesDatePreset", () => {
  const now = new Date(2026, 6, 8, 10, 0);

  it("matches the upcoming Saturday and Sunday for the weekend preset", () => {
    expect(matchesDatePreset(new Date(2026, 6, 11, 9, 0).getTime(), "WEEKEND", now)).toBe(true);
    expect(matchesDatePreset(new Date(2026, 6, 12, 23, 59).getTime(), "WEEKEND", now)).toBe(true);
    expect(matchesDatePreset(new Date(2026, 6, 13, 0, 0).getTime(), "WEEKEND", now)).toBe(false);
  });

  it("keeps the current Sunday in the weekend preset", () => {
    const sunday = new Date(2026, 6, 12, 10, 0);
    expect(matchesDatePreset(new Date(2026, 6, 12, 18, 0).getTime(), "WEEKEND", sunday)).toBe(true);
    expect(matchesDatePreset(new Date(2026, 6, 18, 9, 0).getTime(), "WEEKEND", sunday)).toBe(false);
  });

  it("matches the full current calendar month", () => {
    expect(matchesDatePreset(new Date(2026, 6, 1, 9, 0).getTime(), "MONTH", now)).toBe(true);
    expect(matchesDatePreset(new Date(2026, 6, 31, 23, 59).getTime(), "MONTH", now)).toBe(true);
    expect(matchesDatePreset(new Date(2026, 7, 1, 0, 0).getTime(), "MONTH", now)).toBe(false);
  });
});
