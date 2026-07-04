import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();

vi.mock("./analytics", () => ({ track }));

async function installWithFetch(durationMs: number, response: Response = new Response(null, { status: 200 })) {
  vi.resetModules();
  track.mockClear();
  vi.doMock("./analytics", () => ({ track }));
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.spyOn(window, "fetch").mockImplementation(fetchMock);
  vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(durationMs);
  const { installSlowFetchTracker } = await import("./slowRequests");
  installSlowFetchTracker();
}

describe("slowRequests", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    track.mockClear();
  });

  it("reports ordinary slow fetches as slow_request", async () => {
    await installWithFetch(3_000);

    await window.fetch("/api/report");

    expect(track).toHaveBeenCalledWith(
      "slow_request",
      expect.objectContaining({
        url_path: "/api/report",
        duration_ms: 3000,
        status: 200,
        ok: true,
      }),
    );
  });

  it("does not report normal Firestore long-poll channels as slow_request", async () => {
    await installWithFetch(30_000);

    await window.fetch("https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel");

    expect(track).not.toHaveBeenCalled();
  });

  it("reports unusually long Firestore channels separately", async () => {
    await installWithFetch(61_000);

    await window.fetch("https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel");

    expect(track).toHaveBeenCalledWith(
      "firestore_channel",
      expect.objectContaining({
        channel_kind: "listen",
        channel_reason: "long_poll_over_60s",
        url_host: "firestore.googleapis.com",
        url_path: "/google.firestore.v1.Firestore/Listen/channel",
        duration_ms: 61000,
        status: 200,
        ok: true,
      }),
    );
  });
});
