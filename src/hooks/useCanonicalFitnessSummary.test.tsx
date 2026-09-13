import { act, render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_SCHEMA_VERSION, type CanonicalEnvelope } from "@shared/types/canonical";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  enabled: vi.fn(() => true),
  log: vi.fn(),
  user: { uid: "u1" } as { uid: string } | null,
  rolloutAllows: vi.fn((_surface: "homeSummary" | "fitnessSummary") => true),
  rolloutLoading: false,
  firebaseServices: { auth: { name: "embedded-auth" }, ensureAppCheckReady: vi.fn(), functions: {}, firestore: {} },
}));

vi.mock("../services/canonicalApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/canonicalApi")>();
  return {
    ...actual,
    fetchCanonicalFitnessSummary: mocks.fetch,
    canonicalConsumersEnabled: mocks.enabled,
  };
});
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.log, debugLog: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({
  useFirebaseServices: () => mocks.firebaseServices,
}));
vi.mock("./useCanonicalRollout", () => ({
  useCanonicalRollout: () => ({ gateEnabled: true, loading: mocks.rolloutLoading, verdictOk: true, surfaces: {} }),
  canonicalRolloutAllows: (_state: unknown, surface: "homeSummary" | "fitnessSummary") => mocks.rolloutAllows(surface),
}));

import { useCanonicalFitnessSummary } from "./useCanonicalFitnessSummary";

function envelope(over: Partial<CanonicalEnvelope<unknown>>): CanonicalEnvelope<unknown> {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    algorithmVersion: "v1",
    status: "canonical",
    computedAt: 1,
    inputRevision: null,
    inputDigest: null,
    period: null,
    data: null,
    error: null,
    ...over,
  };
}

/** 서버 봉투 `data` 모양 — 통합 3값은 `current.totalCTL/totalATL/totalTSB`. */
const serverData = (current: unknown) => ({
  current: current && typeof current === "object" ? {
    breakdown: {
      bike: { ctl: 20, atl: 15, tsb: 5, weeklyTSS: 100 },
      run: { ctl: 15, atl: 10, tsb: 5, weeklyTSS: 50 },
      swim: { ctl: 7.5, atl: 5.25, tsb: 2.25, weeklyTSS: 20 },
    },
    totalsBasis: ["bike", "run", "swim"],
    ...current as Record<string, unknown>,
  } : current,
  projection: null, summaries: {}, projections: {}, pdc: {}, timeseries: { bike: null, run: null, swim: null },
});
const values = serverData({ totalCTL: 42.5, totalATL: 30.25, totalTSB: 12.25 });
const parsed = { ctl: 42.5, atl: 30.25, tsb: 12.25 };

/**
 * 홈의 체력 칸이 서버 값으로 갈아타는 경로. **켜지는 조건은 빌드 플래그 AND 서버 판정**이고,
 * 값이 없는 모든 상태에서 숫자를 만들어 내지 않는다.
 */
describe("useCanonicalFitnessSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.rolloutAllows.mockReturnValue(true);
    mocks.rolloutLoading = false;
    mocks.user = { uid: "u1" };
  });

  it("빌드 플래그가 꺼져 있으면 서버를 부르지 않는다 — 화면은 오늘과 똑같다", async () => {
    mocks.enabled.mockReturnValue(false);
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("서버 판정이 이 면을 껐으면 부르지 않는다", async () => {
    mocks.rolloutAllows.mockReturnValue(false);
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("서버 판정을 기다리는 동안 legacy와 canonical 어느 쪽도 시작하지 않는다", () => {
    mocks.rolloutLoading = true;
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    expect(result.current.rolloutState).toBe("pending");
    expect(result.current.enabled).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("정본이면 세 숫자를 준다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ data: values }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).toBe("value"));
    expect(result.current.values).toMatchObject(parsed);
    expect(mocks.fetch).toHaveBeenCalledWith("u1", mocks.firebaseServices);
    expect(mocks.rolloutAllows).toHaveBeenCalledWith("homeSummary");
  });

  it("Fitness 화면은 홈과 별도인 fitnessSummary 판정을 사용한다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ data: values }));
    const { result } = renderHook(() => useCanonicalFitnessSummary("fitnessSummary"));
    await waitFor(() => expect(result.current.display).toBe("value"));
    expect(mocks.rolloutAllows).toHaveBeenCalledWith("fitnessSummary");
  });

  it("stale 이면 값을 버리지 않되 표식을 남긴다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ status: "stale", data: values }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).toBe("value_with_stale_hint"));
    expect(result.current.values).toMatchObject(parsed);
  });

  it("계산 중이고 캐시도 없으면 값을 주지 않는다 — 0 을 그리면 안 된다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ status: "processing", computedAt: null }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).toBe("loading"));
    expect(result.current.values).toBeNull();
  });

  it("실패는 값을 주지 않는다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ status: "failed", computedAt: null }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).toBe("error"));
    expect(result.current.values).toBeNull();
  });

  it("줄 값이 없으면 empty 다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ status: "unavailable", computedAt: null }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).toBe("empty"));
    expect(result.current.values).toBeNull();
  });

  it("같은 계정 재시도가 실패하면 마지막 성공값과 revision을 상태와 함께 유지한다", async () => {
    mocks.fetch.mockResolvedValueOnce(envelope({
      data: values,
      inputRevision: "bike:7|run:3|swim:1",
      inputDigest: "digest-1",
    }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.values).toMatchObject(parsed));
    expect(result.current.metadata?.inputRevision).toBe("bike:7|run:3|swim:1");

    mocks.fetch.mockResolvedValueOnce(envelope({
      status: "failed",
      computedAt: null,
      error: { code: "temporary", retryable: true },
    }));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.display).toBe("error");
    expect(result.current.showingLastGood).toBe(true);
    expect(result.current.values).toMatchObject(parsed);
    expect(result.current.metadata?.inputRevision).toBe("bike:7|run:3|swim:1");
  });

  it("기대한 모양이 아니면 값 없음이다 — 일부 필드만 그리지 않는다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ data: serverData({ totalCTL: 40, totalATL: 30 }) }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).toBe("error"));
    expect(result.current.status).toBe("failed");
    expect(result.current.values).toBeNull();
    expect(mocks.log).toHaveBeenCalled();
  });

  it("stale 응답 모양이 깨지면 contract error와 마지막 성공값을 함께 유지한다", async () => {
    mocks.fetch.mockResolvedValueOnce(envelope({ data: values, inputRevision: "good:1" }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.values).toMatchObject(parsed));

    mocks.fetch.mockResolvedValueOnce(envelope({
      status: "stale",
      data: serverData({ totalCTL: 40, totalATL: 30 }),
      inputRevision: "bad:2",
    }));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.display).toBe("error");
    expect(result.current.showingLastGood).toBe(true);
    expect(result.current.values).toMatchObject(parsed);
    expect(result.current.metadata?.inputRevision).toBe("good:1");
  });

  it("계약 위반 봉투에 숫자가 실려 있어도 첫 방문에서는 표시하지 않는다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ status: "unavailable", data: values }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).toBe("error"));
    expect(result.current.values).toBeNull();
    expect(mocks.log).toHaveBeenCalled();
  });

  it("계정이 바뀌면 이전 계정 값을 즉시 버린다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ data: values }));
    const { result, rerender } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.values).toMatchObject(parsed));

    mocks.fetch.mockReturnValue(new Promise(() => {}));
    mocks.user = { uid: "u2" };
    rerender();
    expect(result.current.values).toBeNull();
  });

  it("계정 전환의 첫 render부터 이전 owner의 값과 metadata를 가린다", async () => {
    mocks.fetch.mockResolvedValueOnce(envelope({ data: values, inputRevision: "u1-secret" }));
    const seen: Array<{ ctl: number | null; revision: string | null }> = [];
    function Probe() {
      const state = useCanonicalFitnessSummary();
      seen.push({
        ctl: state.values?.ctl ?? null,
        revision: state.metadata?.inputRevision ?? null,
      });
      return null;
    }
    const view = render(<Probe />);
    await waitFor(() => expect(seen.some((snapshot) => snapshot.ctl === 42.5)).toBe(true));

    seen.length = 0;
    mocks.user = { uid: "u2" };
    mocks.fetch.mockReturnValueOnce(new Promise(() => {}));
    view.rerender(<Probe />);

    // rerender는 effect까지 flush하지만 seen에는 그보다 앞선 render도 남는다. 하나라도 u1 값이
    // 있으면 실제 브라우저에서도 passive effect 전 한 프레임 노출될 수 있다.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((snapshot) => snapshot.ctl === null && snapshot.revision === null)).toBe(true);
  });

  it("로그아웃 첫 render부터 이전 owner의 값과 metadata를 가린다", async () => {
    mocks.fetch.mockResolvedValueOnce(envelope({ data: values, inputRevision: "u1-secret" }));
    const seen: Array<{ ctl: number | null; revision: string | null }> = [];
    function Probe() {
      const state = useCanonicalFitnessSummary();
      seen.push({
        ctl: state.values?.ctl ?? null,
        revision: state.metadata?.inputRevision ?? null,
      });
      return null;
    }
    const view = render(<Probe />);
    await waitFor(() => expect(seen.some((snapshot) => snapshot.ctl === 42.5)).toBe(true));

    seen.length = 0;
    mocks.user = null;
    view.rerender(<Probe />);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((snapshot) => snapshot.ctl === null && snapshot.revision === null)).toBe(true);
  });

  it("계정 전환 뒤 이전 계정의 in-flight 응답이 도착해도 값이 다시 노출되지 않는다", async () => {
    let resolveFirst!: (value: CanonicalEnvelope<unknown>) => void;
    mocks.fetch.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    const { result, rerender } = renderHook(() => useCanonicalFitnessSummary());

    mocks.user = { uid: "u2" };
    mocks.fetch.mockReturnValueOnce(new Promise(() => {}));
    rerender();
    expect(result.current.enabled).toBe(true);
    expect(result.current.values).toBeNull();

    await act(async () => {
      resolveFirst(envelope({ data: values, inputRevision: "u1-secret" }));
      await Promise.resolve();
    });
    expect(result.current.values).toBeNull();
    expect(result.current.metadata).toBeNull();
  });
});
