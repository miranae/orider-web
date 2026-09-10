import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useActiveBikeProfile } from "./useActiveBikeProfile";

type Subscription = { path: string; next: (snapshot: unknown) => void };

const mocks = vi.hoisted(() => ({
  subscriptions: [] as Subscription[],
  deleteCallable: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_base: unknown, ...parts: string[]) => ({ path: parts.join("/") })),
  doc: vi.fn((_base: unknown, ...parts: string[]) => ({ path: parts.join("/") })),
  onSnapshot: vi.fn((target: { path: string }, next: (snapshot: unknown) => void) => {
    mocks.subscriptions.push({ path: target.path, next });
    return vi.fn();
  }),
  setDoc: (...args: unknown[]) => mocks.setDoc(...args),
  deleteDoc: vi.fn(),
}));
vi.mock("../services/firebase", () => ({
  firestore: {}, auth: {}, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../features/bikeProfileLayout/client", () => ({
  callDeleteBikeProfileAndLayout: (...args: unknown[]) => mocks.deleteCallable(...args),
}));

function profileDoc(id: string, extra: Record<string, unknown> = {}) {
  return { id, data: () => ({ name: id, updatedAt: 100, ...extra }) };
}

function emitProfiles(docs: ReturnType<typeof profileDoc>[]) {
  act(() => {
    mocks.subscriptions.find((s) => s.path === "users/uid-a/bikeProfiles")!.next({ docs });
  });
}

describe("자전거 프로필 삭제 스냅샷", () => {
  beforeEach(() => {
    mocks.subscriptions.length = 0;
    mocks.deleteCallable.mockReset().mockResolvedValue(undefined);
    mocks.setDoc.mockReset().mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  it("삭제 표시된 문서는 숨기고 deletedAt이 없거나 null인 기존 프로필은 유지한다", () => {
    const { result } = renderHook(() => useActiveBikeProfile("uid-a"));

    emitProfiles([
      profileDoc("legacy"),
      profileDoc("active", { deletedAt: null }),
      profileDoc("deleted", { deletedAt: 1234 }),
      profileDoc("deleted-timestamp", { deletedAt: { seconds: 1234, nanoseconds: 0 } }),
    ]);

    expect(result.current.profiles.map((p) => p.id)).toEqual(["legacy", "active"]);
  });

  it("선택한 자전거 삭제 후 문서가 남아도 목록에서 제거하고 남은 자전거로 이동한다", async () => {
    const { result } = renderHook(() => useActiveBikeProfile("uid-a"));
    emitProfiles([profileDoc("road"), profileDoc("gravel")]);
    act(() => result.current.setActive("gravel"));
    expect(result.current.active?.id).toBe("gravel");

    await act(async () => { await result.current.deleteProfile("gravel"); });
    expect(mocks.deleteCallable).toHaveBeenCalledWith("gravel", expect.any(String));
    emitProfiles([profileDoc("road"), profileDoc("gravel", { deletedAt: 1234 })]);

    expect(result.current.profiles.map((p) => p.id)).toEqual(["road"]);
    expect(result.current.active?.id).toBe("road");
  });

  it("마지막 자전거 삭제 후 빈 목록과 선택 없음으로 전환하고 새로 열어도 유지한다", async () => {
    const view = renderHook(() => useActiveBikeProfile("uid-a"));
    emitProfiles([profileDoc("road")]);
    act(() => view.result.current.setActive("road"));
    await act(async () => { await view.result.current.deleteProfile("road"); });
    emitProfiles([profileDoc("road", { deletedAt: 1234 })]);
    expect(view.result.current.profiles).toEqual([]);
    expect(view.result.current.active).toBeNull();

    view.unmount();
    mocks.subscriptions.length = 0;
    const reopened = renderHook(() => useActiveBikeProfile("uid-a"));
    emitProfiles([profileDoc("road", { deletedAt: 1234 })]);
    expect(reopened.result.current.profiles).toEqual([]);
    expect(reopened.result.current.active).toBeNull();
  });
});
