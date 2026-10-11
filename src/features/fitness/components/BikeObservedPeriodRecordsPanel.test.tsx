import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { useLocale } from "../../../contexts/LocaleContext";
import { periodFixture } from "../../../services/trainingAnalysisPeriods.fixture";
import BikeObservedPeriodRecordsPanel from "./BikeObservedPeriodRecordsPanel";
const reads = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../../services/trainingAnalysisPeriods", () => ({ loadTrainingAnalysisPeriods: reads.load }));
function fixture() {
  const data = periodFixture(), period = data.periods[0]!;
  period.activities = Array.from({ length: 6 }, (_, index) => ({ activityId: `source-${index}`, startTime: period.fromInclusive + index + 1, distanceM: 10000 + index * 1000, movingTimeSec: 3600, elevationGainM: index === 0 ? null : 100 + index * 100, sourceBasis: { distanceM: "canonical_metrics" as const, movingTimeSec: "canonical_metrics" as const, elevationGainM: "activity_summary" as const } }));
  return data;
}
describe("cycling observed summaries from the existing response", () => {
  it("folds3 to5, switches metric/source without reads and resets on new snapshot", () => {
    const data = fixture(); const view = renderWithProviders(<BikeObservedPeriodRecordsPanel response={data} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText("15.0km")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "상위 5개 펼치기" })); expect(screen.getAllByRole("link")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "관측된 누적 상승고도" })); expect(screen.getByText("600m")).toBeInTheDocument(); expect(screen.getAllByRole("link")).toHaveLength(3);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "canonical_metrics" } });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(reads.load).not.toHaveBeenCalled();
    view.rerender(<BikeObservedPeriodRecordsPanel response={{ ...data, asOf: data.asOf + 1 }} />);
    expect(screen.getByText("15.0km")).toBeInTheDocument(); expect(screen.getAllByRole("link")).toHaveLength(3);
  });
  it("associates each disclosure with its own list and exposes independent expansion", () => {
    const data = fixture();
    data.periods.push({ ...data.periods[0]!, activities: data.periods[0]!.activities.map(row => ({ ...row, activityId: `previous-${row.activityId}` })) });
    renderWithProviders(<BikeObservedPeriodRecordsPanel response={data} />);
    const toggles = screen.getAllByRole("button", { name: "상위 5개 펼치기" });
    const lists = toggles.map(toggle => document.getElementById(toggle.getAttribute("aria-controls")!)!);
    expect(lists[0]).not.toBe(lists[1]);
    for (const toggle of toggles) expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggles[0]!);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
    expect(toggles[1]).toHaveAttribute("aria-expanded", "false");
    expect(within(lists[0]!).getAllByRole("listitem")).toHaveLength(5);
    expect(within(lists[1]!).getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(toggles[0]!);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
    expect(within(lists[0]!).getAllByRole("listitem")).toHaveLength(3);
    expect(reads.load).not.toHaveBeenCalled();
  });
  it("uses the existing unit settings for distance and total elevation without reads", () => {
    const data = fixture();
    function Settings() { const { setUnits } = useLocale(); return <><button onClick={() => void setUnits("imperial")}>imperial</button><BikeObservedPeriodRecordsPanel response={data} /></>; }
    renderWithProviders(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "imperial" }));
    expect(screen.getByText("9.3mi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "관측된 누적 상승고도" }));
    expect(screen.getByText("1969ft")).toBeInTheDocument();
    expect(reads.load).not.toHaveBeenCalled();
  });
  it("keeps partial/truncated range, total elevation basis and source links visible", () => {
    const data = fixture(); data.periods[0]!.status = "partial"; data.periods[0]!.coverage.truncated = true;
    renderWithProviders(<BikeObservedPeriodRecordsPanel response={data} />);
    expect(screen.getByText(/전체 후보 수는 알 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/활동 전체의 누적 값/)).toBeInTheDocument();
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/ko/activity/source-5");
    expect(screen.getByText(/대표 활동 6개/)).toBeInTheDocument();
  });
  it("hides run, null and preserves empty elevation as unknown rather than a fake0", () => {
    const data = fixture(); data.discipline = "run";
    const view = renderWithProviders(<BikeObservedPeriodRecordsPanel response={data} />); expect(view.container.textContent).toBe("");
    view.rerender(<BikeObservedPeriodRecordsPanel response={null} />); expect(view.container.textContent).toBe("");
    data.discipline = "bike"; data.periods[0]!.activities.forEach(activity => { activity.elevationGainM = null; });
    view.rerender(<BikeObservedPeriodRecordsPanel response={data} />); fireEvent.click(screen.getByRole("button", { name: "관측된 누적 상승고도" }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(screen.queryByText("0m")).not.toBeInTheDocument();
  });
});
