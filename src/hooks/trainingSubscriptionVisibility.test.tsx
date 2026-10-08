import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFtpHistory } from "./useFtpHistory";
import { useUserFitness } from "./useUserFitness";
import { useRunRecords } from "./useRunRecords";
import { useMilestones } from "./useMilestones";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner-a" } as { uid: string } | null,
  firestore: {},
  callbacks: [] as Array<{ path: string; next: (snapshot: unknown) => void; stop: ReturnType<typeof vi.fn> }>,
}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ firestore: mocks.firestore }) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join("/"),
  collection: (_db: unknown, ...parts: string[]) => parts.join("/"),
  orderBy: vi.fn(),
  query: (path: string) => path,
  updateDoc: vi.fn(),
  onSnapshot: (path: string, next: (snapshot: unknown) => void) => {
    const stop = vi.fn();
    mocks.callbacks.push({ path, next, stop });
    return stop;
  },
}));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn(), debugLog: vi.fn() }));

function snapshot(value: unknown) {
  return { exists: () => true, data: () => value, docs: [{ id: "entry", data: () => value }] };
}

beforeEach(() => { mocks.user = { uid: "owner-a" }; mocks.callbacks.length = 0; });

describe("training subscription cache visibility", () => {
  it("같은 계정에서 숨으면 리스너만 닫고 데이터는 보존하며 복귀시 갱신한다", () => {
    const hook = renderHook(({ active }) => ({
      ftp: useFtpHistory(mocks.user?.uid, active),
      fitness: useUserFitness(true, active),
      run: useRunRecords(true, active),
      milestones: useMilestones(true, active),
    }), { initialProps: { active: true } });
    const old = [...mocks.callbacks];
    act(() => {
      old[0]!.next(snapshot({ value: 250, source: "manual", changedAt: 1 }));
      old[1]!.next(snapshot({ totalCTL: 50 }));
      old[2]!.next(snapshot({ run: { best: 1 } }));
      old[3]!.next(snapshot({ celebrated: false }));
    });
    const cached = hook.result.current;
    hook.rerender({ active: false });
    expect(old.every(({ stop }) => stop.mock.calls.length === 1)).toBe(true);
    expect(hook.result.current).toEqual(cached);
    act(() => old[0]!.next(snapshot({ value: 999, source: "manual", changedAt: 2 })));
    expect(hook.result.current.ftp.entries[0]?.value).toBe(250);
    hook.rerender({ active: true });
    expect(hook.result.current.fitness.fitness).toEqual(cached.fitness.fitness);
    act(() => mocks.callbacks.at(-3)!.next(snapshot({ totalCTL: 60 })));
    expect(hook.result.current.fitness.fitness?.totalCTL).toBe(60);
  });

  it.each(["owner-b", null])("숨은 상태에서 owner가 %s 로 바뀌면 캐시를 지우고 늦은 응답을 무시한다", uid => {
    const hook = renderHook(({ active }) => ({
      ftp: useFtpHistory(mocks.user?.uid, active),
      fitness: useUserFitness(true, active),
      run: useRunRecords(true, active),
      milestones: useMilestones(true, active),
    }), { initialProps: { active: true } });
    const old = [...mocks.callbacks];
    act(() => {
      old[0]!.next(snapshot({ value: 250, source: "manual", changedAt: 1 }));
      old[1]!.next(snapshot({ totalCTL: 50 }));
      old[2]!.next(snapshot({ run: { best: 1 } }));
      old[3]!.next(snapshot({ celebrated: false }));
    });
    hook.rerender({ active: false });
    mocks.user = uid ? { uid } : null;
    hook.rerender({ active: false });
    act(() => old[1]!.next(snapshot({ totalCTL: 999 })));
    expect(hook.result.current.ftp.entries).toEqual([]);
    expect(hook.result.current.fitness.fitness).toBeNull();
    expect(hook.result.current.run.run).toBeUndefined();
    expect(hook.result.current.milestones.achieved.size).toBe(0);
    expect(mocks.callbacks).toHaveLength(4);
  });
});


it("숨은 A→B→A 전환 뒤 FTP를 다시 읽기 전에는 최초 로딩 상태를 사용한다", () => {
  const hook = renderHook(({ uid, active }) => useFtpHistory(uid, active),
    { initialProps: { uid: "owner-a", active: true } });
  act(() => mocks.callbacks[0]!.next(snapshot({ value: 250, source: "manual", changedAt: 1 })));
  expect(hook.result.current.loading).toBe(false);
  hook.rerender({ uid: "owner-b", active: false });
  hook.rerender({ uid: "owner-a", active: true });
  expect(hook.result.current.entries).toEqual([]);
  expect(hook.result.current.loading).toBe(true);
});
