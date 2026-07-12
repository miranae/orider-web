import { describe, expect, it, vi } from "vitest";
import { countActiveViewers, createViewerSessionId } from "./viewerPresence";

describe("viewer presence", () => {
  it("counts only viewers seen within the 90 second TTL", () => {
    const now = 200_000;
    expect(countActiveViewers([{ lastSeenAt: 110_000 }, { lastSeenAt: 109_999 }, { lastSeenAt: { toMillis: () => 199_000 } }], now)).toBe(2);
  });

  it("creates a backend-safe session id", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("12345678-1234-4234-8234-123456789abc");
    expect(createViewerSessionId()).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
  });
});
