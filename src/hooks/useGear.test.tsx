import { act, renderHook } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";
import { useGear } from "./useGear";

describe("useGear auth transitions", () => {
  it("uid가 바뀌면 이전 장비를 즉시 숨기고 새 스냅샷까지 loading을 유지한다", () => {
    const listeners: Array<(snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void> = [];
    vi.mocked(onSnapshot).mockImplementation(((_query: unknown, next: typeof listeners[number]) => {
      listeners.push(next);
      return () => {};
    }) as typeof onSnapshot);

    const { result, rerender } = renderHook(({ uid }) => useGear(uid), {
      initialProps: { uid: "user-a" as string | null },
    });
    expect(result.current.loading).toBe(true);

    act(() => listeners[0]?.({ docs: [{ id: "bike-a", data: () => ({ type: "bike", name: "A" }) }] }));
    expect(result.current.items.map((item) => item.id)).toEqual(["bike-a"]);
    expect(result.current.loading).toBe(false);

    rerender({ uid: "user-b" });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(true);

    act(() => listeners[1]?.({ docs: [] }));
    expect(result.current.loading).toBe(false);
  });
});
