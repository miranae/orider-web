import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityComparisonVisuals } from "./ActivityComparisonVisuals";
import type { MetricsLike } from "./metricsPresentation";

const canonical = (points: Array<{ durationSec: number; paceSecPerKm: number }>): MetricsLike => ({
  runMetrics: { gapAvgSec: null, paceCurve: points }, speedCurve: { "5m": 36 },
});

describe("running comparison pace presentation", () => {
  it("shows canonical slow sec/km including three-minute and two-hour observations", () => {
    render(<ActivityComparisonVisuals current={canonical([{ durationSec: 180, paceSecPerKm: 750 }, { durationSec: 7200, paceSecPerKm: 800 }])} previous={canonical([{ durationSec: 180, paceSecPerKm: 780 }, { durationSec: 7200, paceSecPerKm: 840 }])} running units="metric" />);
    expect(screen.getByText("12:30")).toBeInTheDocument();
    expect(screen.getByText("13:00")).toBeInTheDocument();
    expect(screen.getByText("-30 s/km")).toBeInTheDocument();
    expect(screen.getByText(/양쪽 활동의 기록된 경과시간 축/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "7200" } });
    expect(screen.getByText("13:20")).toBeInTheDocument();
    expect(screen.getByText("14:00")).toBeInTheDocument();
  });
  it("supports a single canonical point and imperial pace/delta without speed inversion", () => {
    render(<ActivityComparisonVisuals current={canonical([{ durationSec: 300, paceSecPerKm: 750 }])} previous={canonical([{ durationSec: 300, paceSecPerKm: 780 }])} running units="imperial" />);
    expect(screen.getByText("20:07")).toBeInTheDocument();
    expect(screen.getByText("20:55")).toBeInTheDocument();
    expect(screen.getByText("-48 s/mi")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("300");
  });
  it("explains mixed canonical and legacy basis without plotting a comparison", () => {
    render(<ActivityComparisonVisuals current={canonical([{ durationSec: 300, paceSecPerKm: 750 }])} previous={{ speedCurve: { "5m": 12 } }} running units="metric" />);
    expect(screen.getByText(/페이스 커브 기록 기준이 달라/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("does not fill explicit canonical emptiness from legacy speed", () => {
    render(<ActivityComparisonVisuals current={canonical([])} previous={canonical([{ durationSec: 300, paceSecPerKm: 750 }])} running units="metric" />);
    expect(screen.getByText(/확정 페이스 커브가 모두 제공되지/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("explains disjoint durations separately from missing data", () => {
    render(<ActivityComparisonVisuals current={canonical([{ durationSec: 180, paceSecPerKm: 750 }])} previous={canonical([{ durationSec: 300, paceSecPerKm: 750 }])} running units="metric" />);
    expect(screen.getByText(/공통으로 관측된 지속시간이 없어/)).toBeInTheDocument();
  });
  it("keeps both legacy running conversion and cycling speed units", () => {
    const props = { current: { speedCurve: { "5m": 12 } }, previous: { speedCurve: { "5m": 10 } }, units: "metric" };
    const { rerender } = render(<ActivityComparisonVisuals {...props} running />);
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("6:00")).toBeInTheDocument();
    expect(screen.getByText(/이전 최고 평균 속도 커브/)).toBeInTheDocument();
    rerender(<ActivityComparisonVisuals {...props} running={false} />);
    expect(screen.getByText("12.0")).toBeInTheDocument();
    expect(screen.getByText("10.0")).toBeInTheDocument();
    expect(screen.getByText("+2.0 km/h")).toBeInTheDocument();
  });
});
