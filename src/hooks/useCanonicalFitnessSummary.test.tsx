import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_SCHEMA_VERSION, type CanonicalEnvelope } from "@shared/types/canonical";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  enabled: vi.fn(() => true),
  log: vi.fn(),
  user: { uid: "u1" } as { uid: string } | null,
  rolloutAllows: vi.fn(() => true),
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
vi.mock("./useCanonicalRollout", () => ({
  useCanonicalRollout: () => ({ gateEnabled: true, loading: false, verdictOk: true, surfaces: {} }),
  canonicalRolloutAllows: () => mocks.rolloutAllows(),
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

const values = { ctl: 42.5, atl: 30.25, tsb: 12.25 };

/**
 * 홈의 체력 칸이 서버 값으로 갈아타는 경로. **켜지는 조건은 빌드 플래그 AND 서버 판정**이고,
 * 값이 없는 모든 상태에서 숫자를 만들어 내지 않는다.
 */
describe("useCanonicalFitnessSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.rolloutAllows.mockReturnValue(true);
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

  it("정본이면 세 숫자를 준다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ data: values }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).toBe("value"));
    expect(result.current.values).toEqual(values);
  });

  it("stale 이면 값을 버리지 않되 표식을 남긴다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ status: "stale", data: values }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).toBe("value_with_stale_hint"));
    expect(result.current.values).toEqual(values);
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

  it("기대한 모양이 아니면 값 없음이다 — 일부 필드만 그리지 않는다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ data: { ctl: 40, atl: 30 } }));
    const { result } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.display).not.toBeNull());
    expect(result.current.values).toBeNull();
    expect(mocks.log).toHaveBeenCalled();
  });

  it("계정이 바뀌면 이전 계정 값을 즉시 버린다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ data: values }));
    const { result, rerender } = renderHook(() => useCanonicalFitnessSummary());
    await waitFor(() => expect(result.current.values).toEqual(values));

    mocks.fetch.mockReturnValue(new Promise(() => {}));
    mocks.user = { uid: "u2" };
    rerender();
    expect(result.current.values).toBeNull();
  });
});
