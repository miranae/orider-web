import { describe, expect, it } from "vitest";
import { formatElapsedMillis } from "./leaderboardFormat";

describe("formatElapsedMillis", () => {
  it("formats segment elapsedTime milliseconds as seconds", () => {
    expect(formatElapsedMillis(600_000)).toBe("10:00");
    expect(formatElapsedMillis(3_900_000)).toBe("1:05:00");
  });
});
