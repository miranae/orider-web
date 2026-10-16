import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMonthlyChallenge } from "./useMonthlyChallenge";

const now = Date.parse("2026-10-15T00:00:00Z");
let callbacks: Map<string, (snapshot: never) => void>;
let stops: ReturnType<typeof vi.fn>[];
const readyOwner = {statsIntervalCoverage: {schemaVersion: 1, ownerUid: "rider", state: "ready"}};
const emit = (path: string, data: unknown) => act(() => callbacks.get(path)!({data: () => data} as never));

beforeEach(() => {
  callbacks = new Map(); stops = [];
  vi.mocked(onSnapshot).mockClear().mockImplementation((ref, next) => {
    if (typeof next !== "function") throw new Error("expected snapshot callback");
    callbacks.set((ref as unknown as {path: string}).path, next as (snapshot: never) => void);
    const stop = vi.fn(); stops.push(stop); return stop;
  });
});
afterEach(cleanup);

function acceptMonth(meters = 5000) {
  emit("users/rider/monthly_challenge_participation/2026-10", {tierKm: 300, joinedAt: now});
  emit("users/rider", readyOwner);
  emit("users/rider/stats_rollup/m_2026-10", {schemaVersion: 1, distance: meters});
}

it("활동과 월 밖 대표를 조회하지 않고 서버 월 버킷만 사용한다", async () => {
  const {result, rerender, unmount} = renderHook(({time}) => useMonthlyChallenge("rider", time), {initialProps: {time: now}});
  acceptMonth();
  await waitFor(() => expect(result.current.progress?.distanceKm).toBe(5));
  expect([...callbacks.keys()]).toEqual(["users/rider/monthly_challenge_participation/2026-10", "users/rider", "users/rider/stats_rollup/m_2026-10"]);
  expect(onSnapshot).toHaveBeenCalledTimes(3);
  rerender({time: now + 60000});
  expect(onSnapshot).toHaveBeenCalledTimes(3);
  unmount();
  stops.forEach(stop => expect(stop).toHaveBeenCalledOnce());
});

it("대표 정정·삭제의 서버 차액을 반영하고 미검증·차단 계정 합계는 숨긴다", () => {
  const {result} = renderHook(() => useMonthlyChallenge("rider", now));
  acceptMonth(20000);
  expect(result.current.progress?.distanceKm).toBe(20);
  emit("users/rider/stats_rollup/m_2026-10", {schemaVersion: 1, distance: 3000});
  expect(result.current.progress?.distanceKm).toBe(3);
  emit("users/rider", {...readyOwner, lastStatsReconciliationFailure: {reason: "blocked"}});
  expect(result.current.progress).toBeNull();
  emit("users/rider", readyOwner);
  expect(result.current.progress?.distanceKm).toBe(3);
  emit("users/rider", {statsIntervalCoverage: {schemaVersion: 1, state: "ready", ownerUid: "other"}});
  expect(result.current.progress).toBeNull();
});

it.each([undefined, {}, {schemaVersion: 2, distance: 1000}, {schemaVersion: 1, distance: -1}, {schemaVersion: 1, distance: NaN}])("누락·잘못된 버킷을 0으로 만들지 않는다 %j", data => {
  const {result} = renderHook(() => useMonthlyChallenge("rider", now));
  acceptMonth();
  emit("users/rider/stats_rollup/m_2026-10", data);
  expect(result.current.progress).toBeNull();
  expect(result.current.error).toBe(true);
});

it("정상 확정 0은 보존하고 월·계정 전환 후 이전 결과를 재사용하지 않는다", () => {
  const {result, rerender} = renderHook(({uid, time}) => useMonthlyChallenge(uid, time), {initialProps: {uid: "rider", time: now}});
  acceptMonth(0);
  expect(result.current.progress?.distanceKm).toBe(0);
  const oldCallback = callbacks.get("users/rider/stats_rollup/m_2026-10")!;
  rerender({uid: "rider", time: Date.parse("2026-11-15T00:00:00Z")});
  expect(result.current.progress).toBeNull();
  act(() => oldCallback({data: () => ({schemaVersion: 1, distance: 999999})} as never));
  expect(result.current.progress).toBeNull();
  rerender({uid: "other", time: now});
  expect(result.current.progress).toBeNull();
});
