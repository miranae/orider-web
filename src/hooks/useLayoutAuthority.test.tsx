import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLayoutAuthority } from "./useLayoutAuthority";

type Subscription = { next: (snap: unknown) => void; error: (e: unknown) => void };

const mocks = vi.hoisted(() => ({ subscriptions: [] as Subscription[] }));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_base: unknown, ...parts: string[]) => ({ path: parts.join("/") })),
  onSnapshot: vi.fn((_target: unknown, next: (s: unknown) => void, error: (e: unknown) => void) => {
    mocks.subscriptions.push({ next, error });
    return vi.fn();
  }),
}));
vi.mock("../services/firebase", () => ({
  firestore: {},
  auth: {},
  functions: {},
  ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
}));

/**
 * canonical 이관 판정 (#1943 §10, #1950).
 *
 * **영구 marker 로만** 판정한다 — 레이아웃 문서 개수로 보면 마지막 자전거를 지운 순간 legacy
 * 편집이 다시 열려, 구버전 구성이 canonical 을 덮을 수 있다.
 */
describe("useLayoutAuthority", () => {
  beforeEach(() => {
    mocks.subscriptions.length = 0;
  });

  it("marker 가 있으면 이관됨", async () => {
    const { result } = renderHook(() => useLayoutAuthority("uid-a"));

    mocks.subscriptions[0]!.next({ exists: () => true });

    await waitFor(() => expect(result.current).toEqual({ migrated: true, loading: false }));
  });

  it("marker 가 없으면 아직 legacy", async () => {
    const { result } = renderHook(() => useLayoutAuthority("uid-a"));

    mocks.subscriptions[0]!.next({ exists: () => false });

    await waitFor(() => expect(result.current.migrated).toBe(false));
  });

  /**
   * 못 읽으면 **이관된 것으로 본다.** 아니라고 보면 legacy 쓰기를 다시 열어 되돌릴 수 없는
   * 덮어쓰기가 되지만, 이관됐다고 보면 읽기 전용 안내에 머물다 다음 조회에서 회복된다.
   */
  it("읽지 못하면 이관된 것으로 본다", async () => {
    const { result } = renderHook(() => useLayoutAuthority("uid-a"));

    mocks.subscriptions[0]!.error(new Error("permission-denied"));

    await waitFor(() => expect(result.current).toEqual({ migrated: true, loading: false }));
  });

  it("로그인하지 않았으면 legacy 화면을 막지 않는다", async () => {
    const { result } = renderHook(() => useLayoutAuthority(null));

    await waitFor(() => expect(result.current).toEqual({ migrated: false, loading: false }));
  });
});
