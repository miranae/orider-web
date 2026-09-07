import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import { mockDocData, setDocData } from "../__tests__/mocks/firebase";
import { useActivityMetrics } from "./useActivityMetrics";

/**
 * 훅 헤더가 약속한 4상태(loading/missing/stale/ready)가 실제로 나오는지.
 * stale 은 값을 버리지 않는다 — 모름을 없음으로 그리지 않기 위해 last-known-good 을 들고 온다.
 */
describe("useActivityMetrics", () => {
  beforeEach(() => {
    mockDocData.clear();
  });

  it("문서가 없으면 missing", async () => {
    const { result } = renderHook(() => useActivityMetrics("act-missing"));
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(result.current.metrics).toBeNull();
  });

  it("구독이 꺼져 있으면 disabled", () => {
    const { result } = renderHook(() => useActivityMetrics("act-disabled", false));
    expect(result.current.status).toBe("disabled");
    expect(result.current.metrics).toBeNull();
  });

  it("현재 버전이면 ready", async () => {
    setDocData("activity_metrics/act-ready", { version: ACTIVITY_METRICS_VERSION, tss: 42 });
    const { result } = renderHook(() => useActivityMetrics("act-ready"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metrics?.tss).toBe(42);
  });

  it("버전이 낮으면 stale 이지만 값은 그대로 들고 온다", async () => {
    setDocData("activity_metrics/act-stale", { version: ACTIVITY_METRICS_VERSION - 1, tss: 42 });
    const { result } = renderHook(() => useActivityMetrics("act-stale"));
    await waitFor(() => expect(result.current.status).toBe("stale"));
    expect(result.current.metrics?.tss).toBe(42);
  });

  it("version 필드가 없는 옛 문서는 stale — 모름을 최신으로 그리지 않는다", async () => {
    setDocData("activity_metrics/act-noversion", { tss: 42 });
    const { result } = renderHook(() => useActivityMetrics("act-noversion"));
    await waitFor(() => expect(result.current.status).toBe("stale"));
    expect(result.current.metrics?.tss).toBe(42);
  });

  it("version 이 숫자가 아니면(문자열 등) stale", async () => {
    setDocData("activity_metrics/act-badversion", { version: "3", tss: 42 });
    const { result } = renderHook(() => useActivityMetrics("act-badversion"));
    await waitFor(() => expect(result.current.status).toBe("stale"));
  });
});
