import { describe, expect, it } from "vitest";
import { isRegistrationTimeOpen } from "./event-time";

describe("isRegistrationTimeOpen", () => {
  const now = Date.parse("2026-07-11T00:00:00.000Z");

  it("rejects registration once the event starts even when no closeAt exists", () => {
    expect(isRegistrationTimeOpen(now, undefined, now)).toBe(false);
    expect(isRegistrationTimeOpen(now - 1, undefined, now)).toBe(false);
  });

  it("fails closed when the required start time is missing or invalid", () => {
    expect(isRegistrationTimeOpen(0, undefined, now)).toBe(false);
    expect(isRegistrationTimeOpen(Number.NaN, undefined, now)).toBe(false);
  });

  it("accepts a future event before its closeAt", () => {
    expect(isRegistrationTimeOpen(now + 60_000, "2026-07-11T00:00:30.000Z", now)).toBe(true);
  });

  it("rejects a future event after closeAt", () => {
    expect(isRegistrationTimeOpen(now + 60_000, "2026-07-10T23:59:59.000Z", now)).toBe(false);
  });

  it("does not make malformed optional closeAt values block a future event", () => {
    expect(isRegistrationTimeOpen(now + 60_000, "not-a-date", now)).toBe(true);
  });
});
