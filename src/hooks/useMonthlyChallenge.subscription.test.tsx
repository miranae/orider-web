import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { onSnapshot, where } from "firebase/firestore";
import { afterEach, expect, it, vi } from "vitest";
import { kstMonthWindow, useMonthlyChallenge } from "./useMonthlyChallenge";

afterEach(cleanup);

it("월 경계 후보와 지연 업로드를 운동 시각으로 한 번만 구독하고 대표 날짜로 집계한다", async () => {
  const now = Date.parse("2026-10-15T00:00:00Z");
  const window = kstMonthWindow(now);
  const native = {userId: "rider", source: "orider", type: "Ride", startTime: window.startMs - 15000,
    createdAt: window.startMs - 86400000, summary: {distance: 3000, ridingTimeMillis: 3600000}};
  const lateUpload = {...native, startTime: window.startMs + 3 * 86400000, createdAt: window.endMs + 86400000,
    summary: {distance: 2000, ridingTimeMillis: 3600000}};
  const stop = vi.fn();
  vi.mocked(onSnapshot).mockClear().mockImplementation((ref, next) => {
    if (typeof next !== "function") throw new Error("expected snapshot callback");
    if ((ref as unknown as {path?: string}).path?.includes("participation")) {
      next({data: () => ({tierKm: 300, joinedAt: now})} as never);
    } else {
      next({docs: [
        {id: "native", data: () => native},
        {id: "strava_1", data: () => ({...native, source: "strava", startTime: window.startMs + 15000})},
        {id: "late-upload", data: () => lateUpload},
      ]} as never);
    }
    return stop;
  });
  vi.mocked(where).mockClear();
  const {result, rerender, unmount} = renderHook(({time}) => useMonthlyChallenge("rider", time), {initialProps: {time: now}});
  await waitFor(() => expect(result.current.progress?.distanceKm).toBe(5));
  expect(where).toHaveBeenCalledWith("startTime", ">=", window.startMs - 86400000);
  expect(where).toHaveBeenCalledWith("startTime", "<", window.endMs + 86400000);
  expect(vi.mocked(where).mock.calls.some(([field]) => field === "createdAt")).toBe(false);
  expect(onSnapshot).toHaveBeenCalledTimes(2); // 참여 문서 + 범위가 제한된 활동 쿼리
  rerender({time: now + 60000});
  expect(onSnapshot).toHaveBeenCalledTimes(2);
  unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});

it("월 범위 밖 30시간 대표는 ID 하나만 구독하고 대표 정정·삭제를 즉시 반영한다", async () => {
  const now = Date.parse("2026-10-15T00:00:00Z");
  const window = kstMonthWindow(now);
  const part = {userId: "rider", source: "orider", type: "Ride", rollupSupersededBy: "long-full",
    startTime: window.startMs, endTime: window.startMs + 3600000, summary: {distance: 3000, ridingTimeMillis: 3600000}};
  let representativeCallback: ((snapshot: never) => void) | undefined;
  vi.mocked(onSnapshot).mockClear().mockImplementation((ref, next) => {
    if (typeof next !== "function") throw new Error("expected snapshot callback");
    const path = (ref as unknown as {path?: string}).path;
    if (path === "activities/long-full") representativeCallback = next as typeof representativeCallback;
    else if (path?.includes("participation")) next({data: () => ({tierKm: 300, joinedAt: now})} as never);
    else next({docs: [{id: "fragment", data: () => part}]} as never);
    return vi.fn();
  });
  const {result, rerender} = renderHook(({time}) => useMonthlyChallenge("rider", time), {initialProps: {time: now}});
  await waitFor(() => expect(representativeCallback).toBeDefined());
  expect(result.current.progress).toBeNull();
  const {act} = await import("@testing-library/react");
  act(() => representativeCallback!({exists: () => true, data: () => ({...part, rollupSupersededBy: null, source: "strava",
    startTime: window.startMs - 30 * 3600000, summary: {distance: 100000, ridingTimeMillis: 31 * 3600000}})} as never));
  expect(result.current.progress?.distanceKm).toBe(0);
  rerender({time: now + 60000});
  expect(onSnapshot).toHaveBeenCalledTimes(3); // 기존 두 구독 + ID 직접 조회 하나
  act(() => representativeCallback!({exists: () => false} as never));
  expect(result.current.progress?.distanceKm).toBe(3);
});


it("월 밖 direct 대표가 월 안 범위 쿼리에 편입되면 최신 거리와 날짜를 반영한다", async () => {
  const now = Date.parse("2026-10-15T00:00:00Z");
  const window = kstMonthWindow(now);
  const part = {userId: "rider", source: "orider", type: "Ride", rollupSupersededBy: "full",
    startTime: window.startMs, endTime: window.startMs + 3600000, summary: {distance: 3000, ridingTimeMillis: 3600000}};
  const full = {...part, source: "strava", rollupSupersededBy: null, startTime: window.startMs - 30 * 3600000,
    summary: {distance: 10000, ridingTimeMillis: 31 * 3600000}};
  let direct: ((snapshot: never) => void) | undefined;
  let range: ((snapshot: never) => void) | undefined;
  const stop = vi.fn();
  vi.mocked(onSnapshot).mockClear().mockImplementation((ref, next) => {
    const path = (ref as unknown as {path?: string}).path;
    if (path === "activities/full") { direct = next as typeof direct; return stop; }
    if (path?.includes("participation")) (next as typeof direct)!({data: () => ({tierKm: 300, joinedAt: now})} as never);
    else { range = next as typeof range; range!({docs: [{id: "part", data: () => part}]} as never); }
    return vi.fn();
  });
  const {result} = renderHook(() => useMonthlyChallenge("rider", now));
  await waitFor(() => expect(direct).toBeDefined());
  const {act} = await import("@testing-library/react");
  act(() => direct!({exists: () => true, data: () => full} as never));
  expect(result.current.progress?.distanceKm).toBe(0);
  act(() => range!({docs: [{id: "part", data: () => part}, {id: "full", data: () => ({...full,
    startTime: window.startMs, summary: {...full.summary, distance: 20000}})}]} as never));
  expect(result.current.progress?.distanceKm).toBe(0); // 직접 구독의 다음 snapshot까지 last-good 유지
  act(() => direct!({exists: () => true, data: () => ({...full, startTime: window.startMs,
    summary: {...full.summary, distance: 20000}})} as never));
  expect(result.current.progress?.distanceKm).toBe(20);
  expect(result.current.error).toBe(false);
  expect(result.current.loading).toBe(false);
  expect(stop).not.toHaveBeenCalled();
  expect(onSnapshot).toHaveBeenCalledTimes(3);
});
