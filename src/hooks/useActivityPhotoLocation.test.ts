import { onIdTokenChanged, type User } from "firebase/auth";
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
  it("preserves normal token refreshes and clears navigation on a new sign-in of the same user", () => {
    const user = { uid: "owner", metadata: { lastSignInTime: "first" } } as User;
    const auth = { currentUser: user };
    let onToken!: (viewer: User | null) => void;
    vi.mocked(onIdTokenChanged).mockImplementationOnce((_auth, listener) => {
      onToken = viewer => {
        if (typeof listener === "function") listener(viewer);
        else listener.next?.(viewer);
      };
      onToken(user);
      return vi.fn();
    });
    const services = {};
    const view = renderHook(() => useActivityPhotoLocation("activity:owner", services, auth));
    act(() => { view.result.current.locate([37, 127]); onToken(user); });
    act(() => vi.advanceTimersByTime(10));
    expect(view.result.current.flyToPosition).toEqual([37, 127]);
    act(() => { user.metadata.lastSignInTime = "reauthenticated"; onToken(user); });
    expect(view.result.current.flyToPosition).toBeNull();
  });

  it("rejects a delayed photo movement after sign-in metadata changes before notification", () => {
    const user = { uid: "owner", metadata: { lastSignInTime: "first" } };
    const services = {};
    const auth = { currentUser: user };
    const view = renderHook(() => useActivityPhotoLocation("activity:owner", services, auth));
    act(() => view.result.current.locate([37, 127]));
    user.metadata.lastSignInTime = "second";
    act(() => vi.advanceTimersByTime(10));
    expect(view.result.current.flyToPosition).toBeNull();
  });

  it("drops navigation after a same-UID Firebase session change", () => {
    const services = {};
    const auth = { currentUser: { uid: "owner" } };
    const view = renderHook(() => useActivityPhotoLocation("activity:owner", services, auth));
    act(() => view.result.current.locate([37, 127]));
    auth.currentUser = { uid: "owner" };
    act(() => vi.runAllTimers());
    expect(view.result.current.flyToPosition).toBeNull();
  });
});
