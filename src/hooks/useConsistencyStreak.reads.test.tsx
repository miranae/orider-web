import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Activity } from "@shared/types";

const live = vi.hoisted(() => ({ firestore: { name: "firestore" } as unknown }));
vi.mock("../services/firebase", () => ({
  get auth() { return undefined; },
  get firestore() { return live.firestore; },
  get functions() { return undefined; },
  ensureAppCheckReady: async () => {},
}));

const getDocs = vi.hoisted(() => vi.fn());
vi.mock("firebase/firestore", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  collection: (db: unknown, path: string) => ({ db, path }),
  getDocs,
  limit: (n: number) => ({ limit: n }),
  orderBy: (field: string, direction?: string) => ({ orderBy: field, direction }),
  query: (...args: unknown[]) => args,
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
}));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));

import { useConsistencyStreak } from "./useConsistencyStreak";
import { CONSISTENCY_STREAK_LOOKBACK_MS } from "../utils/consistencyStreak";

const DAY = 86_400_000;
const ride = (id: string, daysAgo: number): Activity => ({
  id, userId: "uid-1", type: "Ride", startTime: Date.now() - daysAgo * DAY,
  summary: { distance: 20_000, ridingTimeMillis: 3_600_000 },
} as unknown as Activity);

describe("useConsistencyStreak 읽기 절감 (#1028)", () => {
  beforeEach(() => getDocs.mockReset());

  it("체력 화면이 이미 읽은 활동이 연속 기록 기간을 덮으면 따로 조회하지 않는다", async () => {
    const preload = {
      activities: [ride("a", 1), ride("b", 8)],
      coversSinceMs: Date.now() - CONSISTENCY_STREAK_LOOKBACK_MS - DAY,
      ready: true,
    };
    const { result } = renderHook(() => useConsistencyStreak("uid-1", preload));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getDocs).not.toHaveBeenCalled();
    expect(result.current.summary).not.toBeNull();
  });

  it("미리 읽는 중이면 조회하지 않고 기다린다 — 같은 문서를 두 번 읽지 않게", () => {
    const preload = { activities: [], coversSinceMs: 0, ready: false };
    const { result } = renderHook(() => useConsistencyStreak("uid-1", preload));
    expect(result.current.loading).toBe(true);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("미리 읽은 기간이 짧으면(30일 보기) 직접 조회한다", async () => {
    getDocs.mockResolvedValue({ docs: [] });
    const preload = { activities: [], coversSinceMs: Date.now() - 72 * DAY, ready: true };
    const { result } = renderHook(() => useConsistencyStreak("uid-1", preload));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getDocs).toHaveBeenCalledOnce();
  });

  it("직접 조회는 최근 등록(createdAt) 200건이 아니라 시작 시각 기간으로 자른다 — 이력 가져오기 직후 오답 방지", async () => {
    getDocs.mockResolvedValue({ docs: [] });
    renderHook(() => useConsistencyStreak("uid-1"));
    await waitFor(() => expect(getDocs).toHaveBeenCalledOnce());
    const parts = JSON.stringify(getDocs.mock.calls[0]![0]);
    expect(parts).toContain('"field":"startTime","op":">="');
    expect(parts).toContain('"orderBy":"startTime"');
    expect(parts).not.toContain("createdAt");
    expect(parts).not.toContain('"limit"');
  });
});
