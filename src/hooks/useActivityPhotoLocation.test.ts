import { act, renderHook } from "@testing-library/react";
import { useActivityPhotoLocation } from "./useActivityPhotoLocation";

describe("useActivityPhotoLocation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it.each(["activity-b:owner", "activity-a:other-owner"])("drops applied and pending photo navigation across %s", identity => {
    const view = renderHook(({identity}) => useActivityPhotoLocation(identity), {initialProps:{identity:"activity-a:owner"}});
    act(() => view.result.current.locate([37,127]));
    act(() => vi.advanceTimersByTime(10));
    expect(view.result.current.flyToPosition).toEqual([37,127]);
    act(() => view.result.current.locate([38,128]));
    view.rerender({identity});
    act(() => vi.runAllTimers());
    expect(view.result.current.flyToPosition).toBeNull();
    view.rerender({identity:"activity-a:owner"});
    expect(view.result.current.flyToPosition).toBeNull();
    act(() => view.result.current.locate([39,129]));
    act(() => vi.advanceTimersByTime(10));
    expect(view.result.current.flyToPosition).toEqual([39,129]);
  });
  it("drops pending and applied navigation when service scope changes with the same activity and UID", () => {
    const first = {}, second = {};
    const view = renderHook(({session}) => useActivityPhotoLocation("activity:owner", session), {initialProps:{session:first}});
    act(() => view.result.current.locate([37,127]));
    act(() => vi.advanceTimersByTime(10));
    expect(view.result.current.flyToPosition).toEqual([37,127]);
    act(() => view.result.current.locate([38,128]));
    view.rerender({session:second});
    act(() => vi.runAllTimers());
    expect(view.result.current.flyToPosition).toBeNull();
    view.rerender({session:first});
    expect(view.result.current.flyToPosition).toBeNull();
  });
  it("cancels superseded requests and unmount timers", () => {
    const view = renderHook(() => useActivityPhotoLocation("activity:owner"));
    act(() => { view.result.current.locate([37,127]); view.result.current.locate([38,128]); });
    act(() => vi.advanceTimersByTime(10));
    expect(view.result.current.flyToPosition).toEqual([38,128]);
    act(() => view.result.current.locate([39,129]));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
