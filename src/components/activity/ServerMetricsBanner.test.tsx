import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ServerMetricsBanner from "./ServerMetricsBanner";

const readyState = {
  status: "ready",
  metrics: {
    tss: 444,
    np: 333,
    if: 0.91,
    vi: 1.08,
    trimp: 72,
    peakHr: { "1m": 181, "5m": 172, "20m": 160 },
    workoutType: "endurance",
    workoutTypeConfidence: 0.9,
    movingTimeSec: 3_600,
    pauseTimeSec: 120,
    computedAt: 1_700_000_000_000,
    version: 1,
  },
} as const;

describe("ServerMetricsBanner sensor provenance", () => {
  it("hides power-derived server metrics for a power-only candidate", () => {
    render(<ServerMetricsBanner state={readyState as never} suppressPowerMetrics />);

    expect(screen.queryByText("333 W")).not.toBeInTheDocument();
    expect(screen.queryByText("444")).not.toBeInTheDocument();
    expect(screen.queryByText("IF")).not.toBeInTheDocument();
    expect(screen.queryByText("VI")).not.toBeInTheDocument();
    expect(screen.queryByText("지구력")).not.toBeInTheDocument();
    expect(screen.getByText("TRIMP")).toBeInTheDocument();
    expect(screen.getByText("peakHR bpm")).toBeInTheDocument();
    expect(screen.getByText("분석상 이동시간")).toBeInTheDocument();
    expect(screen.getByText("60:00")).toBeInTheDocument();
  });

  it("hides heart-rate-derived server metrics for an HR-only candidate", () => {
    render(<ServerMetricsBanner state={readyState as never} suppressHeartRateMetrics />);

    expect(screen.getByText("333 W")).toBeInTheDocument();
    expect(screen.getByText("444")).toBeInTheDocument();
    expect(screen.getByText("IF")).toBeInTheDocument();
    expect(screen.getByText("VI")).toBeInTheDocument();
    expect(screen.queryByText("TRIMP")).not.toBeInTheDocument();
    expect(screen.queryByText("peakHR bpm")).not.toBeInTheDocument();
    expect(screen.queryByText("지구력")).not.toBeInTheDocument();
    expect(screen.getByText("분석상 이동시간")).toBeInTheDocument();
    expect(screen.getByText("60:00")).toBeInTheDocument();
  });

  it.each(["power and HR accepted", "power and HR rejected"])(
    "keeps only independent timing metrics when %s sensor candidates exist",
    () => {
      render(<ServerMetricsBanner
        state={readyState as never}
        suppressPowerMetrics
        suppressHeartRateMetrics
      />);

      expect(screen.queryByText("333 W")).not.toBeInTheDocument();
      expect(screen.queryByText("444")).not.toBeInTheDocument();
      expect(screen.queryByText("IF")).not.toBeInTheDocument();
      expect(screen.queryByText("VI")).not.toBeInTheDocument();
      expect(screen.queryByText("TRIMP")).not.toBeInTheDocument();
      expect(screen.queryByText("peakHR bpm")).not.toBeInTheDocument();
      expect(screen.queryByText("지구력")).not.toBeInTheDocument();
      expect(screen.getByText("분석상 이동시간")).toBeInTheDocument();
      expect(screen.getByText("60:00")).toBeInTheDocument();
    },
  );

  it("keeps all server metrics when the activity has no sensor candidates", () => {
    render(<ServerMetricsBanner state={readyState as never} />);

    expect(screen.getByText("333 W")).toBeInTheDocument();
    expect(screen.getByText("444")).toBeInTheDocument();
    expect(screen.getByText("IF")).toBeInTheDocument();
    expect(screen.getByText("VI")).toBeInTheDocument();
    expect(screen.getByText("TRIMP")).toBeInTheDocument();
    expect(screen.getByText("peakHR bpm")).toBeInTheDocument();
    expect(screen.getByText("지구력")).toBeInTheDocument();
    expect(screen.getByText("분석상 이동시간")).toBeInTheDocument();
    expect(screen.getByText("60:00")).toBeInTheDocument();
  });

  it("keeps workout classification for a cadence-only candidate", () => {
    render(<ServerMetricsBanner
      state={readyState as never}
      suppressPowerMetrics={false}
      suppressHeartRateMetrics={false}
    />);

    expect(screen.getByText("지구력")).toBeInTheDocument();
    expect(screen.getByText("신뢰도 90%")).toBeInTheDocument();
  });
});
