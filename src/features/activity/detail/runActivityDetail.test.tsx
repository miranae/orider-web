import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockActivity } from "../../../__tests__/fixtures/mockData";
import { useRunActivityDetail } from "./runActivityDetail";

vi.mock("../../../hooks/useRunBaselinePace", () => ({ useRunBaselinePace: () => ({ paceSecPerKm: 300 }) }));
vi.mock("../../../hooks/useRunRecords", () => ({ useRunRecords: () => ({ run: undefined }) }));

const base = createMockActivity();
const run = createMockActivity({ type: "Run", source: "strava", summary: { ...base.summary, averageCadence: 95 } });

describe("running interpretation cadence source", () => {
  it("uses canonical cadence instead of the stale activity summary", () => {
    const { result } = renderHook(() => useRunActivityDetail(run, null, { avgCadence: 89, cadenceUnit: "strides_per_minute" }));
    expect(result.current.interpretationContext?.cadenceSpm).toBe(178);
  });
  it("preserves canonical app step cadence", () => {
    const { result } = renderHook(() => useRunActivityDetail(run, null, { avgCadence: 178, cadenceUnit: "spm" }));
    expect(result.current.interpretationContext?.cadenceSpm).toBe(178);
  });
  it("does not replace canonical missing cadence or unknown units with stale summary", () => {
    const { result } = renderHook(() => useRunActivityDetail(run, null, { avgCadence: null, cadenceUnit: "strides_per_minute" }));
    expect(result.current.interpretationContext?.cadenceSpm).toBeNull();
    const unknown = renderHook(() => useRunActivityDetail(run, null, { avgCadence: 95, cadenceUnit: null }));
    expect(unknown.result.current.interpretationContext?.cadenceSpm).toBeNull();
  });
  it("falls back to provider summary only before canonical metrics exist", () => {
    const { result } = renderHook(() => useRunActivityDetail(run, null, null));
    expect(result.current.interpretationContext?.cadenceSpm).toBe(190);
  });
});
