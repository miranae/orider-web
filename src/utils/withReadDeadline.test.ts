import { afterEach, expect, it, vi } from "vitest";
import { withReadDeadline } from "./withReadDeadline";

afterEach(() => vi.useRealTimers());
it("ends a pending read with a retryable error and accepts a fresh retry", async () => {
  vi.useFakeTimers();
  let finish!: (value: string) => void;
  const pending = withReadDeadline(new Promise<string>(resolve => { finish = resolve; }), "Try again", 100);
  const rejected = expect(pending).rejects.toThrow("Try again");
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  finish("stale");
  await expect(withReadDeadline(Promise.resolve("fresh"), "Try again", 100)).resolves.toBe("fresh");
  expect(vi.getTimerCount()).toBe(0);
});
it("preserves permission errors and clears the deadline", async () => {
  vi.useFakeTimers();
  const denied = new Error("permission-denied");
  await expect(withReadDeadline(Promise.reject(denied), "Timeout")).rejects.toBe(denied);
  expect(vi.getTimerCount()).toBe(0);
});
