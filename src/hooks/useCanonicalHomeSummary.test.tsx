import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_SCHEMA_VERSION, type CanonicalEnvelope } from "@shared/types/canonical";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  enabled: vi.fn(() => true),
  log: vi.fn(),
  user: { uid: "u1" } as { uid: string } | null,
}));

vi.mock("../services/canonicalApi", () => ({
  fetchCanonicalHomeSummary: mocks.fetch,
  canonicalConsumersEnabled: mocks.enabled,
}));
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.log }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));

import { useCanonicalHomeSummary } from "./useCanonicalHomeSummary";

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

const totals = { rideCount: 3, distanceKm: 42, movingSec: 100, elevationGainMeters: 10 };
const withTotals = (status: CanonicalEnvelope<unknown>["status"] = "canonical") =>
  envelope({ status, data: { rolling7d: { period: null, totals } } });

describe("useCanonicalHomeSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.user = { uid: "u1" };
  });

  it("스위치가 꺼져 있으면 서버를 부르지 않는다", async () => {
    mocks.enabled.mockReturnValue(false);
    const { result } = renderHook(() => useCanonicalHomeSummary());
    await waitFor(() => expect(result.current.display).toBeNull());
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("계산 중이고 캐시도 없으면 값을 주지 않는다 — 0 을 그리면 안 된다", async () => {
    mocks.fetch.mockResolvedValue(envelope({ status: "processing", computedAt: null }));
    const { result } = renderHook(() => useCanonicalHomeSummary());
    await waitFor(() => expect(result.current.display).toBe("loading"));
    expect(result.current.totals).toBeNull();
  });

  it("실패는 캐시가 있어도 값을 최신처럼 그리지 않는다", async () => {
    mocks.fetch.mockResolvedValueOnce(withTotals());
    const { result, rerender } = renderHook(() => useCanonicalHomeSummary());
    await waitFor(() => expect(result.current.totals).toEqual(totals));

    mocks.fetch.mockResolvedValueOnce(envelope({ status: "failed", computedAt: null }));
    mocks.user = { uid: "u1" };
    rerender();
    await waitFor(() => expect(result.current.display).toBe("error"));
    expect(result.current.totals).toBeNull();
  });

  it("계정이 바뀌면 이전 계정 값을 즉시 버린다", async () => {
    mocks.fetch.mockResolvedValue(withTotals());
    const { result, rerender } = renderHook(() => useCanonicalHomeSummary());
    await waitFor(() => expect(result.current.totals).toEqual(totals));

    // 두 번째 계정의 응답은 영원히 오지 않는다 — 그동안 첫 계정 값이 남아 있으면 안 된다.
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    mocks.user = { uid: "u2" };
    rerender();
    expect(result.current.totals).toBeNull();
  });

  it("이전 계정의 last-known-good 이 새 계정 화면에 새어 나오지 않는다", async () => {
    mocks.fetch.mockResolvedValueOnce(withTotals());
    const { result, rerender } = renderHook(() => useCanonicalHomeSummary());
    await waitFor(() => expect(result.current.totals).toEqual(totals));

    // 새 계정은 아직 계산 중이다. 캐시를 안 비웠다면 "캐시가 있다" 로 판정돼
    // u1 의 수치가 새 계정 화면에 그려진다.
    mocks.fetch.mockResolvedValueOnce(envelope({ status: "processing", computedAt: null }));
    mocks.user = { uid: "u2" };
    rerender();
    await waitFor(() => expect(result.current.display).toBe("loading"));
    expect(result.current.totals).toBeNull();
  });

  it("늦게 온 이전 계정 응답이 최신을 덮지 않는다", async () => {
    let resolveOld: ((e: CanonicalEnvelope<unknown>) => void) | null = null;
    mocks.fetch.mockReturnValueOnce(new Promise((r) => { resolveOld = r; }));
    const { result, rerender } = renderHook(() => useCanonicalHomeSummary());

    mocks.fetch.mockResolvedValueOnce(envelope({ status: "unavailable", computedAt: null }));
    mocks.user = { uid: "u2" };
    rerender();
    await waitFor(() => expect(result.current.display).toBe("empty"));

    // u1 의 응답이 이제 도착한다.
    resolveOld!(withTotals());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.totals).toBeNull();
    expect(result.current.display).toBe("empty");
  });
});
