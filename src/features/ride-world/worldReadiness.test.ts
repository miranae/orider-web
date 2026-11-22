import { watchWorldReadiness } from "./worldReadiness";

it("같은 월드의 준비 상태 확인을 공유하고 장애와 복구를 모두 알린다", async () => {
  vi.useFakeTimers();
  const fetchStatus = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchStatus);
  const first = vi.fn(), second = vi.fn(), report = vi.fn();
  const stopFirst = watchWorldReadiness("wss://world.example.test/events", first);
  const stopSecond = watchWorldReadiness("wss://world.example.test/notification-signals", second, report);
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledOnce();
    expect(fetchStatus.mock.calls[0]?.[0]).toBe("https://world.example.test/ready");
    expect(first.mock.calls).toEqual([[false]]);
    expect(second.mock.calls).toEqual([[false]]);
    expect(report).toHaveBeenCalledWith("RideWorld.readiness", expect.any(Error),
      expect.objectContaining({ status: 503, cause: "http:503" }));
    await vi.advanceTimersByTimeAsync(1500);
    expect(first.mock.calls).toEqual([[false], [true]]);
    expect(second.mock.calls).toEqual([[false], [true]]);
    stopFirst(); stopSecond();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  } finally {
    stopFirst(); stopSecond();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
