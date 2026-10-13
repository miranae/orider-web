import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocale } from "../../../contexts/LocaleContext";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { routeAverageResponse } from "../../../services/activityRouteEvidence.fixture";
import { compareObservedRoutes } from "@shared/observed-route-comparison";
import { observedHistoryActivity, observedHistoryRoute } from "./observedRouteHistory.fixture";
import ObservedRouteHistoryPanel from "./ObservedRouteHistoryPanel";
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), hook: vi.fn(), owner: true, ready: false, short: false, average: true, gap: "", runSpeed: 12, partialAnchor: false }));
vi.mock("../../../hooks/useObservedRouteHistory", () => ({ useObservedRouteHistory: (anchor: ReturnType<typeof observedHistoryActivity>, selected: ReturnType<typeof observedHistoryActivity>[]) => {
  mocks.hook(selected.map(a => a.id)); return { ownerAvailable: mocks.owner, enabled: selected.length > 0, state: mocks.ready ? "ready" : "idle", readCount: mocks.ready ? selected.length + 1 : 0, anchorState: "available", anchorAverage: mocks.average ? { ...routeAverageResponse(anchor.id,anchor.startTime,anchor.type === "Run" ? "run" : "bike", mocks.runSpeed).canonicalAverage!, inputCoverage: mocks.partialAnchor ? "partial_terminal" : "complete" } : null, inspect: mocks.inspect,
    rows: mocks.ready ? selected.map(activity => ({ activity, canonicalAverage: mocks.average && activity.id !== mocks.gap ? routeAverageResponse(activity.id,activity.startTime,activity.type === "Run" ? "run" : "bike",activity.id === "fast" ? 18 : mocks.runSpeed).canonicalAverage : null, read: true, reason: null, state: "available", result: compareObservedRoutes(observedHistoryRoute(anchor.id), { ...observedHistoryRoute(activity.id), ...(mocks.short && activity.id === "short" ? { points: observedHistoryRoute(activity.id).points.slice(0, 2) } : {}) }) })) : [] };
} }));
const anchor = observedHistoryActivity("anchor"), choices = [1, 2, 3, 4].map(i => observedHistoryActivity(`activity${i}`, i));
beforeEach(() => { mocks.owner = true; mocks.ready = false; mocks.short = false; mocks.average = true; mocks.gap = ""; mocks.runSpeed=12; mocks.partialAnchor=false; mocks.inspect.mockReset(); mocks.hook.mockReset(); });
describe("manual selected GPS history panel", () => {
  it("selection and year filtering make no GPS requests, preserve picks and cap free picks3", () => {
    const old = observedHistoryActivity("old", -365);
    const view = renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={[...choices, old]} observedMetricsIdentity="one" />);
    expect(view.container.querySelector("details")!.open).toBe(false);
    view.container.querySelector("details")!.open = true;
    expect(mocks.inspect).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "선택한 GPS 이력 비교" })).toBeDisabled();
    const boxes = screen.getAllByRole("checkbox"); fireEvent.click(boxes[0]!); fireEvent.click(boxes[1]!); fireEvent.click(boxes[2]!);
    expect(screen.getByText("비교 활동 선택 · 3/3")).toBeInTheDocument(); expect(boxes[3]).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2023" } });
    expect(screen.getByText("비교 활동 선택 · 3/3")).toBeInTheDocument(); expect(mocks.inspect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "선택한 GPS 이력 비교" })); expect(mocks.inspect).toHaveBeenCalledTimes(1);
  });
  it("renders chronological direct anchor diagnostics with partial coverage and separate summary basis", () => {
    mocks.ready = true; const view = renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={[...choices].reverse()} observedMetricsIdentity="one" />);
    view.container.querySelector("details")!.open = true;
    fireEvent.click(screen.getAllByRole("checkbox")[1]!); fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/ko/activity/activity1");
    expect(screen.getByRole("status")).toHaveTextContent("선택 2개 · 확인 2개 · 비교 2개 · 근거 부족 0개 · 미확인 0개 · 일부 관측 2개");
    expect(screen.getAllByText(/GPS 관측 시간과 다른 기준/)).toHaveLength(2);
    expect(screen.getByText(/GPS 형태와 수집 범위/)).toBeInTheDocument();
  });
  it("uses the same Seoul year boundary as the displayed source dates", () => {
    const before = { ...observedHistoryActivity("dec31"), startTime: Date.parse("2025-12-31T23:00:00+09:00"), endTime: undefined };
    const after = { ...observedHistoryActivity("jan1"), startTime: Date.parse("2026-01-01T00:00:00+09:00"), endTime: undefined };
    const view = renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={[before, after]} observedMetricsIdentity="one" />);
    view.container.querySelector("details")!.open = true;
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2026" } });
    expect(screen.getByRole("checkbox").closest("label")).toHaveTextContent("2026. 1. 1.");
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("charts actual timestamp gaps, breaks missing values and changes metric/units without GPS calls", () => {
    mocks.ready = true;
    const one = observedHistoryActivity("one", 1), ten = observedHistoryActivity("ten", 10);
    function Settings() { const { setUnits } = useLocale(); return <><button onClick={() => void setUnits("imperial")}>imperial</button><ObservedRouteHistoryPanel anchor={anchor} activities={[one, ten]} observedMetricsIdentity="one" /></>; }
    const view = renderWithProviders(<Settings />); view.container.querySelector("details")!.open = true;
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    expect(view.container.querySelector('circle[data-source-id="anchor"]')).toHaveAttribute("cx", "65");
    expect(view.container.querySelector('circle[data-source-id="one"]')).toHaveAttribute("cx", "97");
    expect(view.container.querySelector('circle[data-source-id="ten"]')).toHaveAttribute("cx", "385");
    fireEvent.click(screen.getByRole("button", { name: "저장 요약 거리 · km" })); fireEvent.click(screen.getByRole("button", { name: "imperial" }));
    expect(screen.getByRole("img")).toHaveAccessibleName(/mi/); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("filters displayed results and chart by year while retaining selected activities", () => {
    mocks.ready = true;
    const before = { ...observedHistoryActivity("before"), startTime: Date.parse("2025-12-31T23:00:00+09:00"), endTime: undefined };
    const after = { ...observedHistoryActivity("after"), startTime: Date.parse("2026-01-01T00:00:00+09:00"), endTime: undefined };
    const view = renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={[before, after]} observedMetricsIdentity="one" />); view.container.querySelector("details")!.open = true;
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2026" } });
    expect(screen.getByText("비교 활동 선택 · 2/3")).toBeInTheDocument();
    expect(screen.getByText("선택 연도에 표시 1개 / 전체 확인 결과 2개")).toBeInTheDocument();
    expect(view.container.querySelector('circle[data-source-id="after"]')).toHaveAttribute("cx", "225");
    expect(view.container.querySelector('circle[data-source-id="before"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /2025. 12. 31./ })).not.toBeInTheDocument(); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("breaks a plotted summary line at a missing value without a zero point", () => {
    mocks.ready = true;
    const one = { ...observedHistoryActivity("missing", 1), summary: {} }, ten = observedHistoryActivity("ten", 10);
    const view = renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={[one, ten]} observedMetricsIdentity="one" />); view.container.querySelector("details")!.open = true;
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "저장 요약 이동시간" }));
    expect(view.container.querySelector('circle[data-source-id="missing"]')).not.toBeInTheDocument();
    expect(view.container.querySelectorAll("circle")).toHaveLength(2);
    expect(screen.queryByTestId("observed-history-segment")).not.toBeInTheDocument();
    expect(screen.getByText(/이동 — · 정지 —/)).toBeInTheDocument();
  });
  it("keeps insufficient shape evidence visible in the list but excludes its chart point", () => {
    mocks.ready = true; mocks.short = true;
    const short = observedHistoryActivity("short", 1), good = observedHistoryActivity("good", 2);
    const view = renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={[short, good]} observedMetricsIdentity="one" />); view.container.querySelector("details")!.open = true;
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    expect(screen.getByText("비교 가능한 관측 길이 부족")).toBeInTheDocument();
    expect(view.container.querySelector('circle[data-source-id="short"]')).not.toBeInTheDocument();
    expect(view.container.querySelector('circle[data-source-id="good"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2023. 11. 16. · 출처 활동/ })).toHaveAttribute("href", "/ko/activity/short");
  });
  it("sorts year options numerically across 9999 and 10000", () => {
    const before = { ...observedHistoryActivity("year9999"), startTime: Date.parse("9999-01-01T00:00:00Z"), endTime: undefined };
    const after = { ...observedHistoryActivity("year10000"), startTime: Date.parse("+010000-01-01T00:00:00Z"), endTime: undefined };
    const view = renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={[before, after]} observedMetricsIdentity="one" />);
    view.container.querySelector("details")!.open = true;
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["모든 연도", "10000", "9999"]);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("hides all private output without current owner authorization", () => {
    mocks.owner = false; const view = renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={choices} observedMetricsIdentity="one" />);
    expect(view.container).toBeEmptyDOMElement(); expect(mocks.inspect).not.toHaveBeenCalled();
  });
});

it("defaults to final averages, keeps canonicalnull gaps and never substitutes stored summary", () => {
  mocks.ready=true;mocks.gap="activity1";const view=renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={choices.slice(0,2)} observedMetricsIdentity="one"/>);view.container.querySelector("details")!.open=true;for(const b of screen.getAllByRole("checkbox"))fireEvent.click(b);
  expect(screen.getByRole("button",{name:"확정 분석 평균 속도 · km/h"})).toHaveAttribute("aria-pressed","true");expect(view.container.querySelector('circle[data-source-id="activity1"]')).not.toBeInTheDocument();expect(screen.queryByTestId("observed-history-segment")).not.toBeInTheDocument();expect(screen.getByText(/저장 요약으로 대체하지 않습니다/)).toBeInTheDocument();expect(mocks.inspect).not.toHaveBeenCalled();
});
it("plots faster run pace higher and preserves realbike0 while run0 has no pace point", () => {
  mocks.ready=true;mocks.runSpeed=0;const run={...anchor,type:"Run"},pick={...choices[0]!,type:"Run"};const view=renderWithProviders(<ObservedRouteHistoryPanel anchor={run} activities={[pick]} observedMetricsIdentity="one"/>);view.container.querySelector("details")!.open=true;fireEvent.click(screen.getByRole("checkbox"));expect(view.container.querySelectorAll("circle")).toHaveLength(0);
  view.rerender(<ObservedRouteHistoryPanel anchor={anchor} activities={choices.slice(0,1)} observedMetricsIdentity="one"/>);view.container.querySelector("details")!.open=true;expect(view.container.querySelector('circle[data-source-id="activity1"]')).toBeInTheDocument();expect(screen.getAllByText(/0.0km\/h/).length).toBeGreaterThan(0);expect(mocks.inspect).not.toHaveBeenCalled();
});

it("places faster running average pace higher without reversing bike speed semantics", () => {
  mocks.ready=true;const run={...anchor,type:"Run"},fast={...observedHistoryActivity("fast",1),type:"Run"};
  const view=renderWithProviders(<ObservedRouteHistoryPanel anchor={run} activities={[fast]} observedMetricsIdentity="one"/>);view.container.querySelector("details")!.open=true;fireEvent.click(screen.getByRole("checkbox"));
  const anchorY=Number(view.container.querySelector('circle[data-source-id="anchor"]')!.getAttribute("cy")),fastY=Number(view.container.querySelector('circle[data-source-id="fast"]')!.getAttribute("cy"));expect(fastY).toBeLessThan(anchorY);expect(mocks.inspect).not.toHaveBeenCalled();
});

it("uses a canonical chart caption and shows anchor computationtime/partial-terminal separately from activity x dates", () => {
  mocks.ready=true;mocks.partialAnchor=true;
  const view=renderWithProviders(<ObservedRouteHistoryPanel anchor={anchor} activities={choices.slice(0,1)} observedMetricsIdentity="one"/>);view.container.querySelector("details")!.open=true;fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByText(/숫자는 확정 분석 평균/)).toBeInTheDocument();expect(screen.queryByText(/활동에 저장된 요약입니다/)).not.toBeInTheDocument();
  expect(screen.getByText(/기준 활동 · 분석 계산 시점/)).toHaveTextContent(/확정된 일부 누락/);
  fireEvent.click(screen.getByRole("button",{name:"저장 요약 이동시간"}));expect(screen.getByText(/활동에 저장된 요약입니다.*날짜/)).toBeInTheDocument();expect(mocks.inspect).not.toHaveBeenCalled();
});
