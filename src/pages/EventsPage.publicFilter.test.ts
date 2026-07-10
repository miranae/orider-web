import { describe, expect, it } from "vitest";
import { isPublicEventInfo } from "./EventsPage";

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
