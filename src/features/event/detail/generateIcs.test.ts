import { describe, expect, it } from "vitest";

import { buildEventIcs, icsFileName, toIcsUtcStamp } from "./generateIcs";

describe("generateIcs", () => {
  it("formats a UTC timestamp per RFC 5545", () => {
    expect(toIcsUtcStamp(Date.UTC(2026, 6, 12, 3, 30, 0))).toBe("20260712T033000Z");
  });

  it("builds a well-formed VEVENT with default duration and escaped text", () => {
    const ics = buildEventIcs({
      id: "evt-1",
      name: "그란폰도, 대회",
      description: "구간; 안내\n둘째 줄",
      startTime: Date.UTC(2026, 6, 12, 0, 0, 0),
      url: "https://orider.co.kr/event/evt-1",
      now: Date.UTC(2026, 6, 1, 0, 0, 0),
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:evt-1@orider.co.kr");
    expect(ics).toContain("DTSTART:20260712T000000Z");
    expect(ics).toContain("DTEND:20260712T040000Z"); // default 4h duration
    expect(ics).toContain("SUMMARY:그란폰도\\, 대회");
    expect(ics).toContain("DESCRIPTION:구간\\; 안내\\n둘째 줄");
    expect(ics).toContain("URL:https://orider.co.kr/event/evt-1");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("honors an explicit duration", () => {
    const ics = buildEventIcs({
      id: "evt-2",
      name: "Tour",
      startTime: Date.UTC(2026, 6, 12, 0, 0, 0),
      durationMs: 2 * 60 * 60 * 1000,
      url: "https://orider.co.kr/event/evt-2",
    });
    expect(ics).toContain("DTEND:20260712T020000Z");
  });

  it("sanitizes filenames while keeping Korean characters", () => {
    expect(icsFileName("2026 봄 그란폰도!")).toBe("2026_봄_그란폰도.ics");
    expect(icsFileName("")).toBe("event.ics");
  });
});
