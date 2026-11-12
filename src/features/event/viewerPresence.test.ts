import { describe, expect, it, vi } from "vitest";
import { ACTIVE_VIEWER_WINDOW_MS, countActiveViewers, createViewerSessionId, loadActiveViewerCount } from "./viewerPresence";
const fs = vi.hoisted(() => ({ where: vi.fn((...args: unknown[]) => ({ where: args })), count: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ millis: ms }) },
  collection: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: fs.where,
  getCountFromServer: fs.count,
}));

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

describe("loadActiveViewerCount", () => {
  it("counts only presence rows seen in the active window with one server aggregate", async () => {
    fs.count.mockResolvedValueOnce({ data: () => ({ count: 3 }) });
    await expect(loadActiveViewerCount({} as never, "event-1", 1_000_000)).resolves.toBe(3);
    expect(fs.where).toHaveBeenCalledWith("lastSeenAt", ">=", { millis: 1_000_000 - ACTIVE_VIEWER_WINDOW_MS });
    expect(fs.count).toHaveBeenCalledTimes(1);
    expect(fs.count.mock.calls[0][0]).toMatchObject({ ref: { path: "events/event-1/viewers" } });
  });
});
