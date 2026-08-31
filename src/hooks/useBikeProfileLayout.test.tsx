import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBikeProfileLayout } from "./useBikeProfileLayout";

type Subscription = { path: string; next: (snap: unknown) => void };

const mocks = vi.hoisted(() => ({
  subscriptions: [] as Subscription[],
  saveLayout: vi.fn(),
  localHead: null as unknown,
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_base: unknown, ...parts: string[]) => ({ path: parts.join("/") })),
  onSnapshot: vi.fn((target: { path: string }, next: (snap: unknown) => void) => {
    mocks.subscriptions.push({ path: target.path, next });
    return vi.fn();
  }),
}));
vi.mock("../services/firebase", () => ({
  firestore: {}, auth: {}, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../features/bikeProfileLayout/outbox", () => ({
  readHead: vi.fn(async () => mocks.localHead),
}));
vi.mock("../features/bikeProfileLayout/client", () => ({ browserSaveDeps: () => ({}) }));
vi.mock("../features/bikeProfileLayout/saveLayout", () => ({
  saveBikeProfileLayout: (...args: unknown[]) => mocks.saveLayout(...args),
}));

const page = { columns: 4, rows: 4, fields: [] };

function remoteSnap(profileId: string, revision: number) {
  return {
    data: () => ({
      revision,
      payload: JSON.stringify({
        schemaVersion: 1,
        profileId,
        sport: "CYCLING",
        pages: [{ columns: 4, rows: 4, fields: [] }],
      }),
    }),
  };
}

/**
 * 편집 대상이 바뀌는 순간의 안전성 (#1943 §9.1, #1950 리뷰 BLOCKER).
 *
 * 이전 자전거의 base·revision 이 남은 채 새 대상으로 저장이 나가면, 미리보기와 실제 덮어쓰는
 * 대상이 달라진다 — 가져오기 마법사에서 그 구간에 확인을 받으면 되돌릴 수 없다.
 */
describe("useBikeProfileLayout 대상 전환", () => {
  beforeEach(() => {
    mocks.subscriptions.length = 0;
    mocks.saveLayout.mockReset().mockResolvedValue({ status: "synced" });
    mocks.localHead = null;
  });

  it("대상이 바뀌면 이전 자전거의 상태를 즉시 버린다", async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useBikeProfileLayout("uid-a", id, [page]),
      { initialProps: { id: "road" } },
    );
    act(() => mocks.subscriptions[0]!.next(remoteSnap("road", 5)));
    await waitFor(() => expect(result.current.revision).toBe(5));

    rerender({ id: "gravel" });

    expect(result.current.revision).toBe(0);
    expect(result.current.canSave).toBe(false);
  });

  /** 조회가 끝나기 전 저장은 새 profileId 에 이전 자전거의 base 를 실어 보낸다. */
  it("조회 중에는 저장하지 않는다", async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useBikeProfileLayout("uid-a", id, [page]),
      { initialProps: { id: "road" } },
    );
    act(() => mocks.subscriptions[0]!.next(remoteSnap("road", 5)));
    await waitFor(() => expect(result.current.canSave).toBe(true));

    rerender({ id: "gravel" });
    const outcome = await result.current.save([page]);

    expect(outcome.status).toBe("localSaveFailed");
    expect(mocks.saveLayout).not.toHaveBeenCalled();
  });

  it("새 대상의 스냅샷이 도착하면 그 revision 으로 저장한다", async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useBikeProfileLayout("uid-a", id, [page]),
      { initialProps: { id: "road" } },
    );
    act(() => mocks.subscriptions[0]!.next(remoteSnap("road", 5)));
    await waitFor(() => expect(result.current.revision).toBe(5));

    rerender({ id: "gravel" });
    act(() => mocks.subscriptions.at(-1)!.next(remoteSnap("gravel", 2)));
    await waitFor(() => expect(result.current.canSave).toBe(true));
    await result.current.save([page]);

    const input = mocks.saveLayout.mock.calls[0]![0] as { profileId: string; expectedRevision: number };
    expect(input).toMatchObject({ profileId: "gravel", expectedRevision: 2 });
  });
});
