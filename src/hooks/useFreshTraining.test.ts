import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onSnapshot } from "firebase/firestore";

import * as errorLogger from "../services/errorLogger";
import { ensureAppCheckReady } from "../services/firebase";
import {
  mockCallableInvocations,
  setCallableImplementation,
  setCallableResult,
} from "../__tests__/mocks/firebase";
import {
  __resetFirestoreSessionRecoveryForTests,
  FIRESTORE_B815_RECOVERY_SESSION_KEY,
  noteFirestoreServerSuccess,
} from "../utils/firestoreSessionRecovery";
import { useFreshTraining } from "./useFreshTraining";

const mocks = vi.hoisted(() => ({
  authLoading: false,
  user: { uid: "training-user" } as { uid: string } | null,
}));

const firestoreRecoveryMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, loading: mocks.authLoading }),
}));

vi.mock("../utils/firestoreSessionRecovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/firestoreSessionRecovery")>();
  return {
    ...actual,
    executeFirestoreSessionRecovery: firestoreRecoveryMocks.execute,
    noteFirestoreServerSuccess: vi.fn(actual.noteFirestoreServerSuccess),
  };
});

interface ControlledListener {
  path: string;
  next: (snapshot: {
    data: () => Record<string, unknown> | undefined;
    metadata: { fromCache: boolean; hasPendingWrites?: boolean };
  }) => void;
  error: (error: Error) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function installControlledSnapshots(includeTimeseries = false): ControlledListener[] {
  const listeners: ControlledListener[] = [];
  vi.mocked(onSnapshot).mockImplementation(((_ref, options, next, error) => {
    const ref = _ref as { path: string };
    expect(options).toEqual({ includeMetadataChanges: true });
    const listener: ControlledListener = {
      path: ref.path,
      next: next as ControlledListener["next"],
      error: error as ControlledListener["error"],
      unsubscribe: vi.fn(),
    };
    // 기존 listener 복구 테스트는 lifecycle 도입 전 사용자를 기본 fixture로 유지한다.
    if (!includeTimeseries && ref.path.includes("/timeseries_")) {
      listener.next({ data: () => undefined, metadata: { fromCache: false } });
    } else listeners.push(listener);
    return listener.unsubscribe;
  }) as typeof onSnapshot);
  return listeners;
}

function emit(
  listener: ControlledListener,
  data: Record<string, unknown>,
  fromCache = false,
) {
  listener.next({ data: () => data, metadata: { fromCache, hasPendingWrites: false } });
}

describe("useFreshTraining", () => {
  beforeEach(() => {
    mocks.authLoading = false;
    mocks.user = { uid: "training-user" };
    vi.mocked(onSnapshot).mockReset();
    __resetFirestoreSessionRecoveryForTests();
    window.sessionStorage.removeItem(FIRESTORE_B815_RECOVERY_SESSION_KEY);
    firestoreRecoveryMocks.execute.mockClear();
    vi.mocked(noteFirestoreServerSuccess).mockClear();
    vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
    setCallableResult("revalidateTraining", { data: { ok: true, status: "recomputed" } });
  });

  it.each(["failed", "pending", "invalidated", "revision-mismatch", "previous-day", "wrong-sport", "ingest-after-read", "unknown-processed", "processed"])("신선한 projection과 별개로 단일 종목 %s lifecycle을 검사한다", async (status) => {
    const listeners = installControlledSnapshots(true);
    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const readTime = { seconds: Math.floor(now / 1000), nanoseconds: 0 };
    const lifecycle = {
      discipline: status === "wrong-sport" ? "run" : "bike",
      loadSnapshot: { inputRevision: 2, inputDigest: "two", asOf: status === "ingest-after-read" ? now - 1000 : now, inputReadTime: readTime,
        coverageStartDate: date, coverageEndDate: status === "previous-day" ? new Date(now - 86400000).toISOString().slice(0, 10) : date,
        points: status === "unknown-processed" ? [{ date, dailyLoad: 0, status: "unknown" }] : [] },
      pmc: { status: ["failed", "pending"].includes(status) ? status : "processed", attemptId: "two", inputRevision: 2,
        processedInputRevision: status === "revision-mismatch" ? 1 : 2, asOf: now, deadlineAt: now - 1 },
      ...(status === "invalidated" ? { inputInvalidatedAt: { ...readTime, nanoseconds: 1 } } : {}),
    };
    const { result, unmount } = renderHook(() => useFreshTraining("bike"));
    expect(listeners.map(listener => listener.path)).toEqual(["users/training-user", "users/training-user/fitness/projection_bike", "users/training-user/fitness/timeseries_bike"]);
    act(() => { emit(listeners[0], status === "ingest-after-read" ? { lastActivityIngestAt: now - 500 } : {}); emit(listeners[1], { computedAt: now }); emit(listeners[2], lifecycle, true); });
    expect(result.current.lastStatus).toBeNull();
    act(() => emit(listeners[2], lifecycle));
    const processed = status === "processed" || status === "unknown-processed";
    await waitFor(() => expect(result.current.lastStatus).toBe(processed ? "fresh" : "recomputed"));
    expect(mockCallableInvocations).toHaveLength(processed ? 0 : 1);
    unmount();
    expect(listeners.every(listener => listener.unsubscribe.mock.calls.length === 1)).toBe(true);
  });

  it("과거 미확인 부하로 stale이어도 최신 revision 처리가 끝난 통합은 반복 계산하지 않는다", async () => {
    const listeners = installControlledSnapshots();
    const { result } = renderHook(() => useFreshTraining("tri"));
    act(() => { emit(listeners[0], {}); emit(listeners[1], { computedAt: Date.now(), processingSourceAsOf: Date.now(), state: "stale", processingState: "processed", inputRevision: "bike:1|run:1|swim:1" }); });
    await waitFor(() => expect(result.current.lastStatus).toBe("fresh"));
    expect(mockCallableInvocations).toHaveLength(0);
  });

  it.each(["pending", "failed"])("통합 completeness가 final이어도 processingState %s는 재검증한다", async (processingState) => {
    const listeners = installControlledSnapshots();
    const { result } = renderHook(() => useFreshTraining("tri"));
    act(() => { emit(listeners[0], {}); emit(listeners[1], { computedAt: Date.now(), state: "final", processingState, inputRevision: "bike:1|run:1|swim:1" }); });
    await waitFor(() => expect(result.current.lastStatus).toBe("recomputed"));
  });

  it.each(["old-source", "previous-day", "ingest-after-source", "missing", "invalid", "fresh"])("통합 쓰기 시각 대신 가장 오래된 원본 시각(%s)으로 신선도를 판단한다", async (scenario) => {
    const listeners = installControlledSnapshots();
    const now = Date.now();
    const sourceAsOf = scenario === "old-source" ? now - 4 * 3600000
      : scenario === "previous-day" ? now - 86400000
      : scenario === "ingest-after-source" ? now - 1000
      : scenario === "missing" ? null : scenario === "invalid" ? Infinity : now;
    const { result } = renderHook(() => useFreshTraining("tri"));
    act(() => {
      emit(listeners[0], scenario === "ingest-after-source" ? { lastActivityIngestAt: now - 500 } : {});
      emit(listeners[1], { computedAt: now, processingSourceAsOf: sourceAsOf, processingState: "processed",
        state: "final", inputRevision: "bike:1|run:1|swim:1" });
    });
    await waitFor(() => expect(result.current.lastStatus).toBe(scenario === "fresh" ? "fresh" : "recomputed"));
    expect(mockCallableInvocations).toHaveLength(scenario === "fresh" ? 0 : 1);
  });

  it("통합 화면은 단일 projection 대신 전체 입력 revision을 확인해 세 종목 갱신을 요청한다", async () => {
    const listeners = installControlledSnapshots();
    const { result } = renderHook(() => useFreshTraining("tri"));
    expect(listeners[1].path).toBe("users/training-user/fitness/current");
    act(() => { emit(listeners[0], {}); emit(listeners[1], { computedAt: Date.now(), state: "final", inputRevision: "bike:1" }); });
    await waitFor(() => expect(result.current.lastStatus).toBe("recomputed"));
    expect(mockCallableInvocations).toEqual([{ name: "revalidateTraining", data: { discipline: "tri" } }]);
  });

  it("통합 전체 revision이 신선하면 재계산 요청을 생략한다", async () => {
    const listeners = installControlledSnapshots();
    const { result } = renderHook(() => useFreshTraining("tri"));
    act(() => { emit(listeners[0], {}); emit(listeners[1], { computedAt: Date.now(), state: "final", inputRevision: "bike:1|run:1|swim:1" }); });
    await waitFor(() => expect(result.current.lastStatus).toBe("fresh"));
    expect(mockCallableInvocations).toHaveLength(0);
  });

  it("손상된 통합 계산 날짜는 화면 오류 없이 재검증한다", async () => {
    const listeners = installControlledSnapshots();
    const { result } = renderHook(() => useFreshTraining("tri"));
    act(() => { emit(listeners[0], {}); emit(listeners[1], { computedAt: Infinity, state: "final", inputRevision: "bike:1|run:1|swim:1" }); });
    await waitFor(() => expect(result.current.lastStatus).toBe("recomputed"));
  });

  it("reports metadata only from current active listeners, including later projection snapshots", () => {
    const listeners = installControlledSnapshots();
    const { unmount } = renderHook(() => useFreshTraining("bike"));
    vi.mocked(noteFirestoreServerSuccess).mockClear();
    act(() => {
      emit(listeners[1], { computedAt: Date.now() });
      emit(listeners[1], { computedAt: Date.now() });
    });
    expect(noteFirestoreServerSuccess).toHaveBeenCalledTimes(2);
    expect(noteFirestoreServerSuccess).toHaveBeenCalledWith({ fromCache: false, hasPendingWrites: false });
    unmount();
    act(() => {
      emit(listeners[0], {});
      emit(listeners[1], {});
    });
    expect(noteFirestoreServerSuccess).toHaveBeenCalledTimes(2);
  });

  it("waits for both first snapshots and keeps both listeners until unmount", async () => {
    const listeners = installControlledSnapshots();
    const { result, unmount } = renderHook(() => useFreshTraining("bike"));

    expect(listeners.map(({ path }) => path)).toEqual([
      "users/training-user",
      "users/training-user/fitness/projection_bike",
    ]);
    act(() => emit(listeners[0]!, { lastActivityIngestAt: 200 }));
    expect(mockCallableInvocations).toHaveLength(0);

    act(() => emit(listeners[1]!, { computedAt: 100 }));
    await waitFor(() => expect(result.current.lastStatus).toBe("recomputed"));
    expect(mockCallableInvocations).toEqual([
      { name: "revalidateTraining", data: { discipline: "bike" } },
    ]);
    expect(listeners.every(({ unsubscribe }) => !unsubscribe.mock.calls.length)).toBe(true);

    unmount();
    expect(listeners.every(({ unsubscribe }) => unsubscribe.mock.calls.length === 1)).toBe(true);
  });

  it("waits for metadata-only server confirmations instead of evaluating cached snapshots", async () => {
    const listeners = installControlledSnapshots();
    const now = Date.now();
    const { result } = renderHook(() => useFreshTraining("bike"));

    act(() => {
      emit(listeners[0]!, { lastActivityIngestAt: now }, true);
      emit(listeners[1]!, { computedAt: now }, true);
    });
    expect(result.current.lastStatus).toBeNull();
    expect(mockCallableInvocations).toHaveLength(0);

    // 데이터는 동일하고 metadata.fromCache만 false로 바뀌는 후속 snapshot이다.
    act(() => emit(listeners[0]!, { lastActivityIngestAt: now }, false));
    expect(result.current.lastStatus).toBeNull();
    act(() => emit(listeners[1]!, { computedAt: now }, false));

    await waitFor(() => expect(result.current.lastStatus).toBe("fresh"));
    expect(mockCallableInvocations).toHaveLength(0);
  });

  it("uses the latest server lastIngest after an activity ingest and discipline change", async () => {
    const listeners = installControlledSnapshots();
    const now = Date.now();
    const { result, rerender } = renderHook(
      ({ discipline }) => useFreshTraining(discipline),
      { initialProps: { discipline: "bike" } },
    );

    act(() => {
      emit(listeners[0]!, { lastActivityIngestAt: now - 1_000 });
      emit(listeners[1]!, { computedAt: now });
    });
    await waitFor(() => expect(result.current.lastStatus).toBe("fresh"));

    // 최초 readiness 이후 들어온 서버 확정 활동 인제스트를 최신 값으로 보존한다.
    act(() => emit(listeners[0]!, { lastActivityIngestAt: now + 1_000 }));
    rerender({ discipline: "run" });
    act(() => emit(listeners[2]!, { computedAt: now }));

    await waitFor(() => expect(mockCallableInvocations).toEqual([
      { name: "revalidateTraining", data: { discipline: "run" } },
    ]));
  });

  it("does not evaluate or call after unmount when only one snapshot arrived", async () => {
    const listeners = installControlledSnapshots();
    const { unmount } = renderHook(() => useFreshTraining("bike"));

    act(() => emit(listeners[0]!, { lastActivityIngestAt: 200 }));
    unmount();
    act(() => emit(listeners[1]!, { computedAt: 100 }));

    await Promise.resolve();
    expect(mockCallableInvocations).toHaveLength(0);
    expect(listeners.every(({ unsubscribe }) => unsubscribe.mock.calls.length === 1)).toBe(true);
  });

  it("cancels the old discipline generation before its snapshots can call the server", async () => {
    const listeners = installControlledSnapshots();
    const { rerender } = renderHook(
      ({ discipline }) => useFreshTraining(discipline),
      { initialProps: { discipline: "bike" } },
    );

    rerender({ discipline: "run" });
    expect(listeners).toHaveLength(3);
    expect(listeners[0]!.unsubscribe).not.toHaveBeenCalled();
    expect(listeners[1]!.unsubscribe).toHaveBeenCalledTimes(1);

    act(() => {
      emit(listeners[0]!, { lastActivityIngestAt: 200 });
      emit(listeners[1]!, { computedAt: 100 });
    });
    expect(mockCallableInvocations).toHaveLength(0);

    act(() => {
      emit(listeners[2]!, { computedAt: 100 });
    });
    await waitFor(() => expect(mockCallableInvocations).toEqual([
      { name: "revalidateTraining", data: { discipline: "run" } },
    ]));
  });

  it("does not call for a generation cancelled while App Check is pending", async () => {
    let releaseOldAppCheck!: () => void;
    vi.mocked(ensureAppCheckReady)
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseOldAppCheck = resolve; }))
      .mockResolvedValueOnce(undefined);
    const listeners = installControlledSnapshots();
    const { rerender } = renderHook(
      ({ discipline }) => useFreshTraining(discipline),
      { initialProps: { discipline: "bike" } },
    );

    act(() => {
      emit(listeners[0]!, { lastActivityIngestAt: 200 });
      emit(listeners[1]!, { computedAt: 100 });
    });
    await waitFor(() => expect(ensureAppCheckReady).toHaveBeenCalledTimes(1));

    rerender({ discipline: "run" });
    act(() => emit(listeners[2]!, { computedAt: 100 }));
    await waitFor(() => expect(mockCallableInvocations).toEqual([
      { name: "revalidateTraining", data: { discipline: "run" } },
    ]));

    releaseOldAppCheck();
    await Promise.resolve();
    expect(mockCallableInvocations).toHaveLength(1);
  });

  it("does not call when the current user listener fails while App Check is pending", async () => {
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    let releaseAppCheck!: () => void;
    vi.mocked(ensureAppCheckReady).mockImplementationOnce(
      () => new Promise<void>((resolve) => { releaseAppCheck = resolve; }),
    );
    const listeners = installControlledSnapshots();
    const { result } = renderHook(() => useFreshTraining("bike"));

    act(() => {
      emit(listeners[0]!, { lastActivityIngestAt: 200 });
      emit(listeners[1]!, { computedAt: 100 });
    });
    await waitFor(() => expect(ensureAppCheckReady).toHaveBeenCalledTimes(1));
    act(() => listeners[0]!.error(new Error("FirebaseError: unavailable")));
    expect(result.current.lastStatus).toBe("error");

    releaseAppCheck();
    await Promise.resolve();
    expect(mockCallableInvocations).toHaveLength(0);
    expect(result.current.lastStatus).toBe("error");
    logSpy.mockRestore();
  });

  it("does not let a callable result overwrite a current user listener failure", async () => {
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    let resolveCallable!: (value: unknown) => void;
    setCallableImplementation(
      "revalidateTraining",
      () => new Promise((resolve) => { resolveCallable = resolve; }),
    );
    const listeners = installControlledSnapshots();
    const { result } = renderHook(() => useFreshTraining("bike"));

    act(() => {
      emit(listeners[0]!, { lastActivityIngestAt: 200 });
      emit(listeners[1]!, { computedAt: 100 });
    });
    await waitFor(() => expect(mockCallableInvocations).toHaveLength(1));
    act(() => listeners[0]!.error(new Error("FirebaseError: unavailable")));
    expect(result.current.lastStatus).toBe("error");

    resolveCallable({ data: { ok: true, status: "recomputed" } });
    await Promise.resolve();
    expect(result.current.lastStatus).toBe("error");
    expect(result.current.justRecomputed).toBe(false);
    logSpy.mockRestore();
  });

  it("prevents the discarded StrictMode generation from calling the server", async () => {
    const listeners = installControlledSnapshots();
    renderHook(() => useFreshTraining("run"), { reactStrictMode: true });

    expect(listeners).toHaveLength(4);
    expect(listeners[0]!.unsubscribe).toHaveBeenCalledTimes(1);
    expect(listeners[1]!.unsubscribe).toHaveBeenCalledTimes(1);
    act(() => {
      listeners.forEach((listener) => emit(listener, listener.path.endsWith("projection_run")
        ? { computedAt: 100 }
        : { lastActivityIngestAt: 200 }));
    });

    await waitFor(() => expect(mockCallableInvocations).toHaveLength(1));
    expect(mockCallableInvocations[0]).toEqual({
      name: "revalidateTraining",
      data: { discipline: "run" },
    });
  });

  it("recovers the poisoned Firestore session when a listener reports b815", async () => {
    const assertion = new Error(
      "FIRESTORE (12.16.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)",
    );
    const listeners = installControlledSnapshots();
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);

    const { result } = renderHook(() => useFreshTraining());
    act(() => listeners[0]!.error(assertion));

    await waitFor(() => expect(result.current.lastStatus).toBe("error"));
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "useFreshTraining.revalidate",
      assertion,
      expect.objectContaining({
        discipline: undefined,
        firestoreRecoveryKind: "b815",
        firestoreRecoveryAction: "reload-ready",
        firebaseSdkVersion: expect.any(String),
        pageVisibility: expect.any(String),
      }),
    );
    expect(window.sessionStorage.getItem(FIRESTORE_B815_RECOVERY_SESSION_KEY)).toBe("1");
    expect(firestoreRecoveryMocks.execute).toHaveBeenCalledWith({
      kind: "b815",
      action: "reload-ready",
    });
    expect(logSpy.mock.invocationCallOrder[0]).toBeLessThan(
      firestoreRecoveryMocks.execute.mock.invocationCallOrder[0]!,
    );
    logSpy.mockRestore();
  });

  it("handles a synchronous onSnapshot registration failure through the same recovery path", async () => {
    const assertion = new Error(
      "FIRESTORE (12.16.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)",
    );
    vi.mocked(onSnapshot).mockImplementation(() => { throw assertion; });
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);

    const { result } = renderHook(() => useFreshTraining("bike"));

    await waitFor(() => expect(result.current.lastStatus).toBe("error"));
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "useFreshTraining.revalidate",
      assertion,
      expect.objectContaining({
        discipline: "bike",
        firestoreRecoveryKind: "b815",
      }),
    );
    expect(firestoreRecoveryMocks.execute).toHaveBeenCalledTimes(1);
    logSpy.mockRestore();
  });

  it("keeps non-transient listener errors on the existing non-reload path", async () => {
    const permissionDenied = Object.assign(new Error("FirebaseError: permission-denied"), {
      code: "permission-denied",
    });
    const listeners = installControlledSnapshots();
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);

    const { result } = renderHook(() => useFreshTraining("bike"));
    act(() => listeners[0]!.error(permissionDenied));

    await waitFor(() => expect(result.current.lastStatus).toBe("error"));
    expect(logSpy).toHaveBeenCalledWith(
      "useFreshTraining.revalidate",
      permissionDenied,
      { discipline: "bike" },
    );
    expect(listeners).toHaveLength(2);
    expect(window.sessionStorage.getItem(FIRESTORE_B815_RECOVERY_SESSION_KEY)).toBeNull();
    expect(firestoreRecoveryMocks.execute).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("retries an unavailable user listener once and recovers without a retry loop", async () => {
    const unavailable = Object.assign(new Error("FirebaseError: unavailable"), {
      code: "unavailable",
    });
    const listeners = installControlledSnapshots();
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    const { result } = renderHook(() => useFreshTraining("bike"));

    act(() => listeners[0]!.error(unavailable));
    await waitFor(() => expect(listeners).toHaveLength(4));
    expect(listeners[0]!.unsubscribe).toHaveBeenCalledTimes(1);
    expect(listeners[1]!.unsubscribe).toHaveBeenCalledTimes(1);

    const now = Date.now();
    act(() => {
      emit(listeners[2]!, { lastActivityIngestAt: now });
      emit(listeners[3]!, { computedAt: now });
    });
    await waitFor(() => expect(result.current.lastStatus).toBe("fresh"));

    // 동일 UID에서는 재시도 예산을 이미 사용했으므로 두 번째 종료는 재구독하지 않는다.
    act(() => listeners[2]!.error(unavailable));
    await waitFor(() => expect(result.current.lastStatus).toBe("error"));
    expect(listeners).toHaveLength(4);
    logSpy.mockRestore();
  });

  it("still recovers a global poisoned queue when the effect unmounts before listener failure", async () => {
    const listeners = installControlledSnapshots();
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);

    const { unmount } = renderHook(() => useFreshTraining("run"));
    unmount();
    listeners[0]!.error(new Error("INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"));

    await waitFor(() => expect(firestoreRecoveryMocks.execute).toHaveBeenCalledTimes(1));
    expect(logSpy).toHaveBeenCalledWith(
      "useFreshTraining.revalidate",
      expect.any(Error),
      expect.objectContaining({
        discipline: "run",
        firestoreRecoveryKind: "b815",
        firestoreRecoveryAction: "reload-ready",
      }),
    );
    logSpy.mockRestore();
  });

  it("keeps a stale uid b815 recovery global without poisoning the current uid generation", async () => {
    const listeners = installControlledSnapshots();
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    const { result, rerender } = renderHook(() => useFreshTraining("bike"));

    mocks.user = { uid: "next-training-user" };
    rerender();
    expect(listeners.map(({ path }) => path)).toEqual([
      "users/training-user",
      "users/training-user/fitness/projection_bike",
      "users/next-training-user",
      "users/next-training-user/fitness/projection_bike",
    ]);

    listeners[0]!.error(new Error("INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"));
    await waitFor(() => expect(firestoreRecoveryMocks.execute).toHaveBeenCalledTimes(1));

    const now = Date.now();
    act(() => {
      emit(listeners[2]!, { lastActivityIngestAt: now });
      emit(listeners[3]!, { computedAt: now });
    });
    await waitFor(() => expect(result.current.lastStatus).toBe("fresh"));
    expect(mockCallableInvocations).toHaveLength(0);
    expect(logSpy).toHaveBeenCalledWith(
      "useFreshTraining.revalidate",
      expect.any(Error),
      expect.objectContaining({ firestoreRecoveryKind: "b815" }),
    );
    logSpy.mockRestore();
  });
});
