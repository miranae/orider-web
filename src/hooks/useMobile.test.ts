import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMobile } from "./useMobile";

let width: number;
let coarse: boolean;
let subscriptions: Set<() => void>[];

beforeEach(() => {
  width = 900;
  coarse = false;
  subscriptions = [];
  vi.spyOn(window, "matchMedia").mockImplementation(query => {
    const listeners = new Set<() => void>();
    subscriptions.push(listeners);
    return {
      media: query,
      get matches() { return coarse || width <= Number(query.match(/max-width: (\d+)px/)?.[1]); },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    } as unknown as MediaQueryList;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function resize(nextWidth: number) {
  act(() => {
    width = nextWidth;
    subscriptions.forEach(listeners => listeners.forEach(listener => listener()));
  });
}

describe("useMobile breakpoint", () => {
  it("keeps the default desktop at 900px while allowing a compact dashboard", () => {
    const standard = renderHook(() => useMobile());
    const dashboard = renderHook(() => useMobile(1024));
    expect(standard.result.current).toBe(false);
    expect(dashboard.result.current).toBe(true);
    resize(1024);
    expect(dashboard.result.current).toBe(false);
    resize(767);
    expect(standard.result.current).toBe(true);
    expect(dashboard.result.current).toBe(true);
  });

  it("updates the subscription and current result when the breakpoint changes", () => {
    const { result, rerender, unmount } = renderHook(({ breakpoint }) => useMobile(breakpoint), { initialProps: { breakpoint: 768 } });
    expect(result.current).toBe(false);
    rerender({ breakpoint: 1024 });
    expect(result.current).toBe(true);
    expect(subscriptions.filter(listeners => listeners.size)).toHaveLength(1);
    resize(1000);
    expect(result.current).toBe(true);
    resize(1024);
    expect(result.current).toBe(false);
    unmount();
    expect(subscriptions.every(listeners => listeners.size === 0)).toBe(true);
  });

  it("preserves coarse pointer support above either width breakpoint", () => {
    width = 1400;
    coarse = true;
    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(true);
    act(() => { coarse = false; subscriptions.forEach(listeners => listeners.forEach(listener => listener())); });
    expect(result.current).toBe(false);
  });
});
