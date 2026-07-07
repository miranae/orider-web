import { describe, expect, it } from "vitest";
import { generateICS } from "./icsExport";
import type { PlanWeek } from "@shared/types/goal";

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === "export.icsCalName") return `Plan ${options?.goalName}`;
  return key;
};

function makeWeek(durationMin: number): PlanWeek {
  return {
    id: "week-01",
    weekNumber: 1,
    phase: "build",
    startDate: Date.parse("2026-07-06T15:00:00.000Z"),
    plannedTSS: 100,
    days: [{
      date: Date.parse("2026-07-06T15:00:00.000Z"),
      dayOfWeek: 2,
      workout: "z2",
      plannedTSS: 50,
      plannedDurationMin: durationMin,
      completed: false,
      skipped: false,
    }],
  };
}

describe("generateICS", () => {
  it("emits timezone date-time DTSTART with time duration", () => {
    const ics = generateICS([makeWeek(90)], "Base", t);

    expect(ics).toContain("X-WR-TIMEZONE:Asia/Seoul");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Asia/Seoul");
    expect(ics).toContain("TZOFFSETTO:+0900");
    expect(ics).toContain("DTSTART;TZID=Asia/Seoul:20260707T060000");
    expect(ics).toContain("DURATION:PT1H30M");
    expect(ics).not.toContain("DTSTART;VALUE=DATE");
  });

  it("does not emit invalid zero or fractional duration tokens", () => {
    const zero = generateICS([makeWeek(0)], "Base", t);
    const fractional = generateICS([makeWeek(45.6)], "Base", t);

    expect(zero).not.toContain("DURATION:PT0H0M");
    expect(fractional).toContain("DURATION:PT0H46M");
    expect(fractional).not.toContain("45.6M");
  });
});
