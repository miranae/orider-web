import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BIKE_DISTANCE_TARGETS } from "@shared/activity-bike-distance-evidence";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { cyclingDistancePeriodFixture } from "../../../utils/cyclingDistancePeriods.fixture";
import ko from "../../../i18n/resources/ko/activity.json";
import en from "../../../i18n/resources/en/activity.json";
import CyclingDistancePeriodAnalysis from "./CyclingDistancePeriodAnalysis";
function open() { const summary = screen.getByText("기간별 사이클링 거리 관측 비교"), details = summary.closest("details")!; details.open = true; fireEvent(details,new Event("toggle")); }
describe("cycling13 period presentation", () => {
  it("starts closed and compares two already-observed period values at10km without a data hook", () => {
    const response=cyclingDistancePeriodFixture(), p=structuredClone(response.periods[0]!);p.fromInclusive=10000;p.toExclusive=20000;p.activities[0]!.startTime=12000;
    const d=p.cyclingDistanceObservations!.distances[1]!;d.sources[0]!.startTime=12000;d.bestTimeSeconds=d.medianTimeSeconds=d.sources[0]!.elapsedSec=900;
    response.periods.push(p);response.asOf=20000;
    renderWithProviders(<CyclingDistancePeriodAnalysis response={response}/>);expect(screen.queryByRole("combobox")).not.toBeInTheDocument();expect(screen.queryByRole("link")).not.toBeInTheDocument();
    open();expect(screen.getByRole("combobox")).toHaveValue("10km");expect(within(screen.getByRole("combobox")).getAllByRole("option")).toHaveLength(13);
    const table=screen.getByRole("table");expect(within(table).getAllByText("16:40")).toHaveLength(2);expect(within(table).getAllByText("15:00")).toHaveLength(2);
    expect(screen.getAllByRole("link")).toHaveLength(2);expect(screen.getAllByRole("link")[0]).toHaveAttribute("href","/ko/activity/a");
    for(const distance of ["80km","50miles"]) {fireEvent.change(screen.getByRole("combobox"),{target:{value:distance}});expect(screen.getByRole("combobox")).toHaveValue(distance);expect(screen.getAllByText(/支持|지원된 관측 입력에서/)).toHaveLength(2);expect(screen.queryByRole("link")).not.toBeInTheDocument();}
  });
  it("explains absent channels as unknown, preserving the bike disclosure while hiding run/null", () => {
    const response=cyclingDistancePeriodFixture();delete response.periods[0]!.cyclingDistanceObservations;
    const view=renderWithProviders(<CyclingDistancePeriodAnalysis response={response}/>);open();expect(screen.getByText(/구형 응답이나 검증할 수 없는 채널/)).toBeInTheDocument();expect(within(screen.getByRole("table")).getAllByText("—")).toHaveLength(3);
    view.rerender(<CyclingDistancePeriodAnalysis response={{...response,discipline:"run"}}/>);expect(screen.queryByText("기간별 사이클링 거리 관측 비교")).not.toBeInTheDocument();view.rerender(<CyclingDistancePeriodAnalysis response={null}/>);expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("shows unsupported/unavailable and truncated ranges without claiming zero-time records", () => {
    const response=cyclingDistancePeriodFixture();for(const d of response.periods[0]!.cyclingDistanceObservations!.distances){d.truncated=true;d.unsupportedActivityCount=1;d.supportedActivityCount=d.observedEffortActivityCount=d.noObservedEffortActivityCount=0;d.sources=[];d.bestTimeSeconds=d.medianTimeSeconds=null;}
    renderWithProviders(<CyclingDistancePeriodAnalysis response={response}/>);open();expect(screen.getByText(/종목 필터 전 최대 200개/)).toBeInTheDocument();expect(screen.getByText(/0초 기록으로 처리하지 않습니다/)).toBeInTheDocument();expect(screen.queryByText("0:00")).not.toBeInTheDocument();
  });
  it("preserves fractional median precision and renders only5 local sources before explicit more", () => {
    const response=cyclingDistancePeriodFixture(),d=response.periods[0]!.cyclingDistanceObservations!.distances[1]!;d.medianTimeSeconds=1000.5;
    d.sources=Array.from({length:6},(_,index)=>({...d.sources[0]!,sourceActivityId:`활동${index}`}));
    renderWithProviders(<CyclingDistancePeriodAnalysis response={response}/>);open();expect(screen.getByText("16:40.5")).toBeInTheDocument();expect(screen.getAllByRole("link")).toHaveLength(5);expect(screen.getAllByRole("link")[0]).toHaveAttribute("href","/ko/activity/%ED%99%9C%EB%8F%990");
    fireEvent.click(screen.getByRole("button",{name:"출처 5개 더 보기"}));expect(screen.getAllByRole("link")).toHaveLength(6);
  });
  it("keeps complete labels and source/truncation disclosures in both locales", () => {
    for(const locale of [ko,en]) {expect(Object.keys(locale.manualBikeEvidence.distances)).toEqual([...BIKE_DISTANCE_TARGETS]);expect(locale.cyclingDistancePeriods.basis).toBeTruthy();expect(locale.cyclingDistancePeriods.unknown).toBeTruthy();expect(locale.cyclingDistancePeriods.scrollHint).toBeTruthy();}
  });
});

it("shows stored attribution separately from neutral legacy source while preserving elapsed values",()=>{
  const response=cyclingDistancePeriodFixture(), source=response.periods[0]!.cyclingDistanceObservations!.distances[1]!.sources[0]!;
  source.provenance={...source.provenance,declaredActivitySource:"apple_health",status:"stored_explicit"};
  const view=renderWithProviders(<CyclingDistancePeriodAnalysis response={response}/>);open();
  expect(screen.getByRole("link")).toHaveTextContent("Apple Health");expect(screen.getByText(/원본 시계 연결/)).toBeInTheDocument();
  source.provenance={...source.provenance,declaredActivitySource:null,status:"legacy_normalized"};
  view.rerender(<CyclingDistancePeriodAnalysis response={{...response}}/>);
  expect(screen.getByRole("link")).toHaveTextContent("이전 표본 · 출처 미확인");expect(screen.getByRole("link")).toHaveTextContent("16:40");
});
