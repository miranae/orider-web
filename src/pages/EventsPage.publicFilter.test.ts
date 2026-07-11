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
  const now = new Date("2026-07-08T10:00:00+09:00");

  it("matches the upcoming Saturday and Sunday for the weekend preset", () => {
    expect(matchesDatePreset(new Date("2026-07-11T09:00:00+09:00").getTime(), "WEEKEND", now)).toBe(true);
    expect(matchesDatePreset(new Date("2026-07-12T23:59:00+09:00").getTime(), "WEEKEND", now)).toBe(true);
    expect(matchesDatePreset(new Date("2026-07-13T00:00:00+09:00").getTime(), "WEEKEND", now)).toBe(false);
  });

  it("matches from today through the end of the current month", () => {
    expect(matchesDatePreset(new Date("2026-07-31T23:59:00+09:00").getTime(), "MONTH", now)).toBe(true);
    expect(matchesDatePreset(new Date("2026-08-01T00:00:00+09:00").getTime(), "MONTH", now)).toBe(false);
  });
});
