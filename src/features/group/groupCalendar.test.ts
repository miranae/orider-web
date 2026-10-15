import { describe, expect, it } from "vitest";
import { groupCalendarUrl } from "./groupCalendar";
describe("public group calendar contract", () => {
  it("does not produce inaccessible private or inactive group calendar links", () => {
    expect(groupCalendarUrl({ id: "club", visibility: "private", isActive: true })).toBeNull();
    expect(groupCalendarUrl({ id: "club", visibility: "public", isActive: false })).toBeNull();
    expect(groupCalendarUrl(null)).toBeNull();
    expect(groupCalendarUrl({ id: "public club", visibility: "public", isActive: true })).toContain("/groupEventCalendar?groupId=public%20club");
  });
});
