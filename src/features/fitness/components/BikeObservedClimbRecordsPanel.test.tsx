import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { useLocale } from "../../../contexts/LocaleContext";
import { periodFixture } from "../../../services/trainingAnalysisPeriods.fixture";
import BikeObservedClimbRecordsPanel from "./BikeObservedClimbRecordsPanel";
const reads = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../../services/trainingAnalysisPeriods", () => ({ loadTrainingAnalysisPeriods: reads.load }));
function fixture() {
  const response = periodFixture(), p = response.periods[0]!;
  p.cyclingClimbObservations = { version: 1, scope: "observed_representatives", climbQuality: "unknown", candidateActivityCount: 8, supportedActivityCount: 6, observedActivityCount: 6, noObservedActivityCount: 0, unsupportedActivityCount: 1, unavailableActivityCount: 1, truncated: false, sources: Array.from({ length: 5 }, (_, i) => ({ sourceActivityId: `climb-${i}`, startTime: 2000 + i, metricsRevision: "100:1", contributingActivityCount: 1, startKm: 1, endKm: 2, lengthKm: 1, elevationGainM: 100 - i, avgGrade: (100 - i) / 10, durationSec: 100, vam: 3600 - i * 36, timingBasis: "stored_detector_time_unverified", wholeActivityElevationQuality: "reliable", sourceLayer: "unknown" })) };
  return response;
}
describe("stored individual climb presentation", () => {
  it("starts collapsed, folds3 to5 locally and resets on new input identity", () => {
    const data = fixture(), view = renderWithProviders(<BikeObservedClimbRecordsPanel response={data} />);
    const details = view.container.querySelector("details")!; expect(details.open).toBe(false);
    fireEvent.click(view.container.querySelector("summary")!);
    expect(screen.getAllByRole("link", { hidden: true })).toHaveLength(3);
    const toggle = screen.getByRole("button", { name: "상위 5개 펼치기", hidden: true });
    const list = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(within(list).getAllByRole("listitem", { hidden: true })).toHaveLength(3);
    fireEvent.click(toggle); expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { hidden: true })).toHaveLength(5);
    view.rerender(<BikeObservedClimbRecordsPanel response={{ ...data, inputDigest: "b".repeat(64) }} />);
    expect(view.container.querySelector("details")!.open).toBe(false);
    expect(screen.getAllByRole("link", { hidden: true })).toHaveLength(3);
    expect(reads.load).not.toHaveBeenCalled();
  });
  it("keeps period expansion independent and links source activities without displaying unverified timing", () => {
    const data = fixture(); data.periods.push(structuredClone(data.periods[0]!));
    renderWithProviders(<BikeObservedClimbRecordsPanel response={data} />);
    const toggles = screen.getAllByRole("button", { name: "상위 5개 펼치기", hidden: true });
    fireEvent.click(toggles[0]!); expect(toggles[1]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("link", { hidden: true })[0]).toHaveAttribute("href", "/ko/activity/climb-0");
    expect(screen.getAllByText(/개별 클라임 품질은 확인되지/)).toHaveLength(1);
    expect(screen.queryByText(/3600|VAM/)).not.toBeInTheDocument();
    expect(reads.load).not.toHaveBeenCalled();
  });
  it("uses existing unit settings for gain, interval and length", () => {
    function Settings() { const { setUnits } = useLocale(); return <><button onClick={() => void setUnits("imperial")}>imperial</button><BikeObservedClimbRecordsPanel response={fixture()} /></>; }
    renderWithProviders(<Settings />); fireEvent.click(screen.getByRole("button", { name: "imperial" }));
    expect(screen.getByText("단일 상승 328ft")).toBeInTheDocument();
    expect(screen.getAllByText("활동 내 구간 0.6mi–1.2mi")).toHaveLength(3);
    expect(screen.getByText("길이 0.6mi · 평균 경사 10.0%")).toBeInTheDocument();
  });
  it("discloses absent, unsupported, unavailable, no-observed and truncated coverage honestly", () => {
    const data = fixture(), view = renderWithProviders(<BikeObservedClimbRecordsPanel response={data} />);
    expect(screen.getByText(/관측 6개/)).toBeInTheDocument(); expect(screen.getByText(/미지원 1개/)).toBeInTheDocument();
    data.periods[0]!.cyclingClimbObservations = undefined; view.rerender(<BikeObservedClimbRecordsPanel response={{ ...data, asOf: 10001 }} />);
    expect(screen.getByText(/클라임이 없다는 뜻은 아닙니다/)).toBeInTheDocument();
    expect(screen.queryByText(/출처 활동의 전체 고도 품질/)).not.toBeInTheDocument();
    const channel = fixture().periods[0]!.cyclingClimbObservations!; channel.sources = []; channel.observedActivityCount = 0; channel.noObservedActivityCount = 6; channel.truncated = true;
    data.periods[0]!.cyclingClimbObservations = channel; view.rerender(<BikeObservedClimbRecordsPanel response={{ ...data, asOf: 10002 }} />);
    expect(screen.getByText(/전체 후보 수와 기간 전체 최고 기록/)).toBeInTheDocument(); expect(screen.getByText(/전체 기록의 클라임 부재/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/출처 활동의 전체 고도 품질/)).not.toBeInTheDocument();
  });
  it("hides run and null without affecting stored responses", () => {
    const data = fixture(); data.discipline = "run";
    const view = renderWithProviders(<BikeObservedClimbRecordsPanel response={data} />); expect(view.container).toBeEmptyDOMElement();
    view.rerender(<BikeObservedClimbRecordsPanel response={null} />); expect(view.container).toBeEmptyDOMElement();
  });
});
