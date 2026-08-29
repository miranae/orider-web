import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// initFirebase() 는 모든 모듈 평가가 끝난 뒤에 실행된다 — 목이 그 순서를 재현한다.
const live = vi.hoisted(() => ({ firestore: undefined as unknown }));

vi.mock("../services/firebase", () => ({
  get auth() { return undefined; },
  get firestore() { return live.firestore; },
  get functions() { return undefined; },
  ensureAppCheckReady: async () => {},
}));

const getDocs = vi.hoisted(() => vi.fn());
vi.mock("firebase/firestore", () => ({
  and: (...args: unknown[]) => args,
  collection: (db: unknown, path: string) => {
    // 실제 SDK 와 같은 실패 방식 — Provider 없는 일반 웹 트리에서 db 가 undefined 면 던진다.
    if (!db) throw new Error("Expected first argument to collection() to be a CollectionReference");
    return { db, path };
  },
  getDocs,
  limit: (n: number) => n,
  orderBy: (...args: unknown[]) => args,
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
}));

const logClientError = vi.hoisted(() => vi.fn());
vi.mock("../services/errorLogger", () => ({ logClientError }));

import { useConsistencyStreak } from "./useConsistencyStreak";

describe("useConsistencyStreak (Provider 없는 일반 웹 트리)", () => {
  it("initFirebase 이후 싱글턴으로 조회한다 — 회귀 #849 로그인 후 무한 재마운트", async () => {
    live.firestore = { name: "firestore" };
    getDocs.mockResolvedValue({ docs: [] });

    const { result } = renderHook(() => useConsistencyStreak("uid-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(logClientError).not.toHaveBeenCalled();
    expect(getDocs).toHaveBeenCalled();
  });
});
