import { MemoryRouter } from "react-router-dom";
import { getDoc } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { formatTrainingLoad } from "../utils/trainingLoadDisplay";
import { WeeklyTssBars, type WeeklyTssBar } from "./DashboardPage";
import type { WeeklyLoadEvidence } from "../components/WeeklyChart";

/**
 * 부하를 알 수 없는 주(`tss=null`)를 0 막대로 그리면 "쉰 주"라는 거짓 확정값이 된다 (#2237).
 * 빈 칸 + "기록 없음" 툴팁이어야 한다.
 */
describe("WeeklyTssBars", () => {
  const weeks = [
    { week: "W1", tss: 300, tssEstimated: false, tssUnknownCount: 0 },
    { week: "W2", tss: null, tssEstimated: false, tssUnknownCount: 0 },
    { week: "W3", tss: 150, tssEstimated: false, tssUnknownCount: 0 },
  ];
  const tooltipFor = (w: { week: string; tss: number | null }) =>
    w.tss == null ? `${w.week}: 기록 없음` : `${w.week}: ${w.tss} TSS`;

  it("tss=null 인 주는 막대가 아니라 빈 칸으로 그린다", () => {
    render(<WeeklyTssBars weeks={weeks} tooltipFor={tooltipFor} />);

    expect(screen.getAllByTestId("weekly-tss-bar")).toHaveLength(2);
    expect(screen.getAllByTestId("weekly-tss-bar-unknown")).toHaveLength(1);
  });

  it("빈 칸에 호버하면 '기록 없음' 툴팁이 뜬다 — 0 TSS 라고 말하지 않는다", () => {
    render(<WeeklyTssBars weeks={weeks} tooltipFor={tooltipFor} />);

    fireEvent.pointerEnter(screen.getByTestId("weekly-tss-bar-unknown"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("W2주 · 부하 미산출");
    expect(screen.queryByText("W2: 0 TSS")).not.toBeInTheDocument();
  });

  it("최고값 정규화에 null 주가 끼어들지 않는다", () => {
    render(<WeeklyTssBars weeks={weeks} tooltipFor={tooltipFor} />);

    const [first, second] = screen.getAllByTestId("weekly-tss-bar");
    expect(first).toHaveStyle({ height: "100%" });
    expect(second).toHaveStyle({ height: "50%" });
  });
  it("uses distance geometry and keeps TSS secondary without inventing missing distances", () => {
    renderWithProviders(<WeeklyTssBars metric="distance" weeks={[
      { ...weeks[0]!, distance: 120, tssEstimated: true, tssUnknownCount: 1 }, { ...weeks[1]!, distance: 60 }, { ...weeks[2]!, distance: null },
    ]} tooltipFor={tooltipFor} />);
    const bars = screen.getAllByTestId("weekly-distance-bar");
    expect(bars[0]).toHaveStyle({ height: "100%" });
    expect(bars[1]).toHaveStyle({ height: "50%" });
    fireEvent.focus(screen.getByRole("button", { name: "W1주 · 120 km" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("W1주 · 120 km");
    expect(screen.getByRole("tooltip")).toHaveTextContent("TSS ≈300+");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("파워 기반");
    fireEvent.focus(screen.getByRole("button", { name: "W3주 · 거리 미확인" }));
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("0 km");
    expect(screen.getAllByTestId("weekly-distance-bar-unknown")).toHaveLength(1);
  });

  it("never labels a partial-query zero as a confirmed rest week and marks observed distance as a subtotal", () => {
    renderWithProviders(<WeeklyTssBars metric="distance" coverage="partial" weeks={[
      { ...weeks[0]!, distance: 0 }, { ...weeks[1]!, distance: 410 },
    ]} tooltipFor={tooltipFor} />);
    expect(screen.getByRole("button", { name: "W1주 · 거리 미확인" })).toBeInTheDocument();
    expect(screen.queryByTestId("weekly-zero-marker")).not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole("button", { name: "W2주 · 410+ km" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("410+ km");
    expect(screen.getByRole("button", { name: "W2 활동별 TSS 보기" })).toBeInTheDocument();
  });

  it("marks the current zero at its own calendar slot and keeps unknown weeks distinct", () => {
    renderWithProviders(<WeeklyTssBars metric="distance" weeks={[
      { ...weeks[0]!, week: "9/28", distance: null },
      { ...weeks[1]!, week: "10/5", distance: 410 },
      { ...weeks[2]!, week: "10/12", distance: 0 },
    ]} tooltipFor={tooltipFor} />);
    const current = screen.getByRole("button", { name: "10/12주 · 0 km" });
    const marker = within(current).getByTestId("weekly-zero-marker");
    expect(marker).toHaveAttribute("data-current-week", "true");
    expect(marker).toHaveTextContent("0");
    expect(within(current).getByTestId("weekly-distance-bar")).toHaveStyle({ height: "0%" });
    expect(within(screen.getByRole("button", { name: "9/28주 · 거리 미확인" })).queryByTestId("weekly-zero-marker")).not.toBeInTheDocument();
    const ticks = screen.getByTestId("weekly-chart-ticks");
    expect(ticks.children).toHaveLength(3);
    expect(ticks.children[2]).toHaveAttribute("data-week-index", current.getAttribute("data-week-index"));
    expect(ticks.children[2]).toHaveTextContent("10/12이번 주");
    expect(ticks.children[1]).toHaveTextContent("10/5");
  });

  it("shows a running distance-only chart with metre precision and a keyboard-accessible zero", () => {
    renderWithProviders(<WeeklyTssBars metric="distance" showTrainingLoad={false}
      distanceFormatter={km => `${Math.round(km * 1000)}m`}
      weeks={[{ ...weeks[0]!, distance: 0.35 }, { ...weeks[1]!, distance: 0 }]}
      tooltipFor={tooltipFor} />);
    fireEvent.focus(screen.getByRole("button", { name: "W1주 · 350m" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("350m");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("TSS");
    expect(screen.queryByRole("button", { name: /활동별 TSS/ })).not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole("button", { name: "W2주 · 0m" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("0m");
    expect(screen.getByTestId("weekly-zero-marker")).toHaveAttribute("data-current-week", "true");
  });

  it("keeps partial running zero unknown while displaying positive observed distance as a subtotal", () => {
    renderWithProviders(<WeeklyTssBars metric="distance" coverage="partial" showTrainingLoad={false}
      distanceFormatter={km => `${km}mi`}
      weeks={[{ ...weeks[0]!, distance: 0 }, { ...weeks[1]!, distance: 0.5 }]}
      tooltipFor={tooltipFor} />);
    expect(screen.getByRole("button", { name: "W1주 · 거리 미확인" })).toBeInTheDocument();
    fireEvent.focus(screen.getByRole("button", { name: "W2주 · 0.5mi+" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("0.5mi+");
    expect(screen.queryByTestId("weekly-zero-marker")).not.toBeInTheDocument();
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("TSS");
  });

  it.each(["loading", "error", "unavailable"] as const)("keeps %s running distance unknown instead of drawing zero", coverage => {
    renderWithProviders(<WeeklyTssBars metric="distance" coverage={coverage} showTrainingLoad={false}
      weeks={[{ ...weeks[0]!, distance: 0 }]} tooltipFor={tooltipFor} />);
    expect(screen.getByTestId("weekly-distance-bar-unknown")).toBeInTheDocument();
    expect(screen.queryByTestId("weekly-zero-marker")).not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole("button", { name: "W1주 · 거리 미확인" }));
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("TSS");
  });

  const evidence: WeeklyLoadEvidence = {
    periodStartMs: Date.UTC(2026, 8, 27, 15), periodEndMs: Date.UTC(2026, 9, 4, 15), timeZone: "Asia/Seoul",
    scope: "allSupported", coverage: "partial", total: 80, estimated: true, storedTotal: 50, estimatedTotal: 30, basisTotals: { power: 50, heartRate: 0, time: 30, unknown: 0 },
    rawCount: 7, acceptedCount: 5, duplicateCount: 1, contributingCount: 3, storedCount: 1, estimatedCount: 1,
    unknownCount: 1, knownZeroCount: 1, excludedCount: 1, unsupportedOrDeletedCount: 1,
    rows: [
      { activityId: "saved", title: "FTP 사용자 활동명", startTime: Date.UTC(2026, 8, 28), discipline: "bike", source: "server", basis: "power", value: 50 },
      { activityId: "time", title: "시간 근거 기록", startTime: Date.UTC(2026, 8, 29), discipline: "run", source: "time", basis: "time", value: 30, input: { kind: "time", durationMillis: 3600000, factor: 30 } },
      { activityId: "unknown", title: "미산출 기록", startTime: Date.UTC(2026, 8, 30), discipline: "swim", source: "unknown", basis: "unknown", value: null },
      { activityId: "zero", title: "확인된 영 기록", startTime: Date.UTC(2026, 9, 1), discipline: "bike", source: "time", basis: "unknown", value: 0, knownZero: true },
      { activityId: "excluded", title: "제외 기록", startTime: Date.UTC(2026, 9, 2), discipline: "bike", source: "excluded", basis: "excluded", value: 0 },
    ],
  };

  it("shows keyboard-accessible summary evidence and keeps activity links in a separate region", () => {
    renderWithProviders(<WeeklyTssBars weeks={[{ ...weeks[0]!, tss: 80, loadEvidence: evidence }]} tooltipFor={tooltipFor} />);
    const bar = screen.getByRole("button", { name: "W1: 80 TSS" });
    fireEvent.focus(bar);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveTextContent("파워 기반50 TSS");
    expect(tooltip).toHaveTextContent("시간 추정30 TSS");
    expect(tooltip).not.toHaveTextContent("시간당 계수");
    expect(tooltip).not.toHaveTextContent("추가 기록이 누락");
    expect(tooltip).not.toHaveTextContent("집계 근거 보기");
    expect(tooltip).not.toHaveTextContent("산입");
    expect(within(tooltip).queryByRole("link")).not.toBeInTheDocument();
    expect(within(tooltip).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "W1 활동별 TSS 보기" }));
    const details = screen.getByRole("region", { name: "W1 활동별 TSS 산출값" });
    expect(details).toHaveTextContent("Asia/Seoul");
    expect(within(details).getAllByRole("link")).toHaveLength(5);
    expect(details).toHaveTextContent("반영 시간 60분 ÷ 60 × 시간당 계수 30");
    expect(details).toHaveTextContent("산출 방식 미상 · 0 TSS");
    expect(within(details).getByRole("link", { name: "FTP 사용자 활동명" })).toHaveAttribute("href", "/ko/activity/saved");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps a tapped summary open until Escape and never invents missing evidence totals", () => {
    render(<WeeklyTssBars weeks={[weeks[1]!]} tooltipFor={tooltipFor} />);
    fireEvent.click(screen.getByRole("button", { name: "W2: 기록 없음" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("TSS 산출 기반과 입력값을 확인할 수 없습니다");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("저장·서버 0");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("이동거리");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("lets the pointer move into the portal to read the summary before delayed dismissal", () => {
    vi.useFakeTimers();
    try {
      render(<WeeklyTssBars weeks={[weeks[0]!]} tooltipFor={tooltipFor} />);
      const bar = screen.getByRole("button", { name: "W1: 300 TSS" });
      fireEvent.pointerEnter(bar);
      const tooltip = screen.getByRole("tooltip");
      fireEvent.pointerLeave(bar);
      fireEvent.pointerEnter(tooltip);
      act(() => vi.advanceTimersByTime(150));
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      fireEvent.pointerLeave(tooltip);
      act(() => vi.advanceTimersByTime(150));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it("uses already-loaded basis totals without querying original power inputs", () => {
    vi.mocked(getDoc).mockClear();
    render(<MemoryRouter><WeeklyTssBars weeks={[{ ...weeks[0]!, tss: 80, loadEvidence: evidence, distance: 120 }]} tooltipFor={tooltipFor} /></MemoryRouter>);
    fireEvent.focus(screen.getByRole("button", { name: "W1: 80 TSS" }));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("파워 기반50 TSS");
    expect(tooltip).toHaveTextContent("시간 추정30 TSS");
    expect(tooltip).toHaveTextContent("W1주 · 80 TSS");
    expect(tooltip).toHaveTextContent("이동거리 120 km");
    expect(tooltip).not.toHaveTextContent("Asia/Seoul");
    expect(tooltip).not.toHaveTextContent("2026");
    expect(tooltip).not.toHaveTextContent("NP");
    expect(tooltip).not.toHaveTextContent("FTP");
    expect(within(tooltip).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "W1 활동별 TSS 보기" }));
    expect(screen.getByRole("region", { name: "W1 활동별 TSS 산출값" })).toBeInTheDocument();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it.each([
    [true, "ready", 0, "≈80"],
    [false, "partial", 0, "80+"],
    [false, "ready", 1, "80+"],
    [true, "partial", 1, "≈80+"],
    [false, "ready", 0, "80"],
  ] as const)("preserves detailed total provenance: estimate %s, coverage %s, unknown %s", (estimated, coverage, unknownCount, expected) => {
    renderWithProviders(<WeeklyTssBars weeks={[{ ...weeks[0]!, tss: 80,
      loadEvidence: { ...evidence, estimated, coverage, unknownCount },
    }]} tooltipFor={tooltipFor} />);
    fireEvent.click(screen.getByRole("button", { name: "W1 활동별 TSS 보기" }));
    const detail = screen.getByRole("region", { name: "W1 활동별 TSS 산출값" });
    expect(within(detail).getByText(expected, { exact: true })).toBeInTheDocument();
  });

  it("keeps a real zero basis visible without turning an unknown weekly total into zero", () => {
    const zeroEvidence: WeeklyLoadEvidence = { ...evidence, total: 0, basisTotals: { power: 0, heartRate: 0, time: 0, unknown: 0 }, rows: [evidence.rows[3]!] };
    const { rerender } = render(<WeeklyTssBars weeks={[{ ...weeks[0]!, tss: 0, loadEvidence: zeroEvidence }]} tooltipFor={tooltipFor} />);
    fireEvent.focus(screen.getByRole("button", { name: "W1: 0 TSS" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("산출 방식 미상0 TSS");
    rerender(<WeeklyTssBars weeks={[{ ...weeks[0]!, tss: null, loadEvidence: { ...zeroEvidence, total: null, rows: [evidence.rows[2]!] } }]} tooltipFor={tooltipFor} />);
    expect(screen.getByRole("tooltip")).toHaveTextContent("부하 미산출");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("0 TSS");
  });

  it("keeps existing per-activity time inputs in details without expanding the tooltip", () => {
    const rows = ["first", "second"].map(activityId => ({ ...evidence.rows[1]!, activityId, value: 1, input: { kind: "time" as const, durationMillis: 60000, factor: 30 } }));
    renderWithProviders(<WeeklyTssBars weeks={[{ ...weeks[0]!, tss: 2, loadEvidence: { ...evidence, total: 2, basisTotals: { power: 0, heartRate: 0, time: 2, unknown: 0 }, rows } }]} tooltipFor={tooltipFor} />);
    fireEvent.focus(screen.getByRole("button", { name: "W1: 2 TSS" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("시간 추정2 TSS");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("계수");
    fireEvent.click(screen.getByRole("button", { name: "W1 활동별 TSS 보기" }));
    expect(within(screen.getByRole("region")).getAllByText(/반영 시간 1분 ÷ 60 × 시간당 계수 30/)).toHaveLength(2);
  });

});

function ProvenanceBars({ point }: { point: WeeklyTssBar }) {
  const { t } = useTranslation("dashboard");
  return <WeeklyTssBars weeks={[point]} tooltipFor={(row) => `${row.week}: ${formatTrainingLoad(row, t)}`} />;
}

it.each([
  [100, false, 1, "TSS 100", "부분합계"],
  [0, false, 1, "TSS 0", "부분합계"],
  [null, false, 1, "TSS 미확인", "부분합계"],
  [42, true, 0, "TSS 42", "추정 포함"],
])("실제 TSS 점 %s의 미확인/추정 상태를 접근성 라벨에 보존한다", (tss, tssEstimated, tssUnknownCount, value, qualifier) => {
  renderWithProviders(<ProvenanceBars point={{ week: "W", tss, tssEstimated, tssUnknownCount }} />);
  fireEvent.pointerEnter(screen.getByTestId(tss === null ? "weekly-tss-bar-unknown" : "weekly-tss-bar"));
  expect(screen.getByRole("button", { name: text => text.startsWith("W:") && text.includes(value) && text.includes(qualifier) })).toBeInTheDocument();
});
