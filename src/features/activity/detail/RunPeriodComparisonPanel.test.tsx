import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { runningPeriodFixture } from "../../../services/trainingAnalysisPeriods.fixture";
import { LocaleProvider } from "../../../contexts/LocaleContext";
import RunPeriodComparisonPanel from "./RunPeriodComparisonPanel";

describe("running period comparison", () => {
  it("shows observed elapsed records, pace, source links, counts and same-basis reductions", () => {
    renderWithProviders(<RunPeriodComparisonPanel response={runningPeriodFixture()} />);
    const row = screen.getByRole("row", { name: /5km/ });
    expect(row).toHaveTextContent("20:00"); expect(row).toHaveTextContent("21:00"); expect(row).toHaveTextContent("+1:00");
    expect(row).toHaveTextContent("4:00/km"); expect(row).toHaveTextContent("이 항목 관측 활동 1개");
    expect(within(row).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/ko/activity/a", "/ko/activity/b"]);
    expect(screen.getByRole("combobox", { name: "공통 시간 선택" })).toHaveValue("300");
    fireEvent.change(screen.getByRole("combobox", { name: "공통 시간 선택" }), { target: { value: "7200" } });
    expect(screen.getByRole("combobox", { name: "공통 시간 선택" })).toHaveValue("7200");
    expect(screen.getByRole("row", { name: /^10km/ })).toHaveTextContent("—");
  });
  it("keeps KST period boundaries and converts pace to imperial units without changing official distances", () => {
    renderWithProviders(<LocaleProvider userId={null} profile={{ units: "imperial" }}><RunPeriodComparisonPanel response={runningPeriodFixture()} /></LocaleProvider>);
    expect(screen.getByText(/선택 기간 · 2026. 10. 02./)).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /5km/ })).toHaveTextContent("6:26/mi");
  });
  it("withholds reductions for partial or truncated inputs but preserves observed values", () => {
    const response = runningPeriodFixture(); const best = response.periods[0]!.running!.bestDistances;
    best.status = "partial"; best.coverage.truncated = true;
    response.periods[0]!.running!.paceCurves[0]!.status = "partial";
    renderWithProviders(<RunPeriodComparisonPanel response={response} />);
    const row = screen.getByRole("row", { name: /5km/ });
    expect(row).toHaveTextContent("20:00"); expect(row).not.toHaveTextContent("+1:00");
    expect(screen.getByText(/누락되어 관측된 최고값만/)).toBeInTheDocument();
    expect(screen.getByText(/조회 한도로 일부/)).toBeInTheDocument();
    expect(screen.getByText(/km당 페이스 단축/)).toHaveTextContent("—");
  });
  it("never compares canonical pace with speed conversion or interpolates missing common durations", () => {
    const response = runningPeriodFixture();
    const previous = response.periods[1]!.running!.paceCurves[0]!;
    previous.sourceBasis = "speed_curve_kmh_converted";
    previous.points = previous.points.filter(point => point.durationSeconds === 300).map(point => ({ ...point, speedKph: 3600 / point.paceSecPerKm }));
    renderWithProviders(<RunPeriodComparisonPanel response={response} />);
    expect(screen.queryByRole("combobox", { name: "공통 시간 선택" })).not.toBeInTheDocument();
    expect(screen.getByText(/같은 기록 기준의 공통 시간이 없어/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "커브 기록 기준" }), { target: { value: "speed_curve_kmh_converted" } });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("does not replace settled empty records with zero or offer an empty curve basis", () => {
    const response = runningPeriodFixture();
    response.periods.forEach(period => {
      const running = period.running!;
      running.bestDistances.points = [];
      running.bestDistances.coverage.eligibleActivityCount = 0;
      running.bestDistances.coverage.noObservedEffortActivityCount = 1;
      running.paceCurves.forEach(curve => { curve.points = []; curve.coverage.eligibleActivityCount = 0; curve.coverage.noObservedEffortActivityCount = 1; });
    });
    renderWithProviders(<RunPeriodComparisonPanel response={response} />);
    expect(screen.getByRole("row", { name: /5km/ })).not.toHaveTextContent("0:00");
    expect(screen.queryByRole("combobox", { name: "커브 기록 기준" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/관측 기록 없음 1개/)).toHaveLength(2);
  });
  it("supports additive legacy absence and renders nothing outside running", () => {
    const response = runningPeriodFixture(); response.periods.forEach(period => { delete period.running; });
    const { rerender } = renderWithProviders(<RunPeriodComparisonPanel response={response} />);
    expect(screen.getByText(/러닝 최고 기록 정본을 아직/)).toBeInTheDocument();
    rerender(<RunPeriodComparisonPanel response={{ ...response, discipline: "bike" }} />);
    expect(screen.queryByRole("region", { name: "러닝 기간별 최고 기록 비교" })).not.toBeInTheDocument();
  });
});
