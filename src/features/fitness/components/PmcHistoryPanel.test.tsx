import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { FitnessPoint } from "../../../utils/fitnessMetrics";
import PmcHistoryPanel from "./PmcHistoryPanel";
import type { PmcHistoryPoint } from "../pmcHistory";

// 선택 구간은 그래프(slider)로만 고른다 — 키보드 Home/→ 로 index 를 맞추고 aria-valuenow(1부터)로 읽는다.
const sliderIndex = (slider: Element) => Number(slider.getAttribute("aria-valuenow")) - 1;
const selectSliderAt = (slider: Element, index: number) => {
  fireEvent.keyDown(slider, { key: "Home" });
  for (let step = 0; step < index; step += 1) fireEvent.keyDown(slider, { key: "ArrowRight" });
};

const point = (date: string, ctl = 40, dailyLoad = 60): FitnessPoint => ({ date, ctl, atl: ctl + 5, tsb: -5, dailyLoad });
const points = [point("2023-09-06"), point("2025-09-06", 30), point("2026-09-05"), point("2026-09-06", 50, 0)];
const renderPanel = (data = points) => renderWithProviders(<PmcHistoryPanel points={data} today="2026-09-06" canonical />);

describe("PmcHistoryPanel", () => {
  it("never represents an unconfirmed load as known zero while preserving confirmed zero", () => {
    const data: PmcHistoryPoint = { ...point("2026-09-06", 40, 0), loadStatus: "unconfirmed", calculationStatus: "estimated" };
    const view = renderPanel([data]);
    const selected = screen.getByTestId("K1-2-7");
    expect(selected.querySelector("dd")).toHaveTextContent("—");
    expect(selected).toHaveTextContent("미확인 · 0/1 일");
    expect(selected).toHaveTextContent("1/1 일");
    view.rerender(<PmcHistoryPanel points={[{ ...data, loadStatus: "final" }]} today={data.date} canonical />);
    expect(selected.querySelector("dd")).toHaveTextContent("0.0");
    expect(selected).toHaveTextContent("확정 · 1/1 일");
  });

  it("shortens narrow TSB axis labels while preserving full selected dates", () => {
    class NarrowResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([{ target, contentRect: { width: 320 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", NarrowResizeObserver);
    try {
      const { container } = renderPanel();
      const tsb = screen.getByRole("slider", { name: "회복 상태 · 독립 축" });
      expect(tsb).toHaveTextContent("09-06");
      expect(tsb).not.toHaveTextContent("2026-09-06");
      expect(tsb.getAttribute("aria-valuetext")).toContain("2026-09-06");
      expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("2026-09-06");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps load and PMC coverage visible without opening a disclosure", () => {
    const { container } = renderPanel([{ ...point("2026-09-06", 40, 70), loadStatus: "unconfirmed", calculationStatus: "pending" }]);
    expect(container.querySelector("details")).not.toBeInTheDocument();
    const evidence = screen.getByTestId("K1-2-7");
    expect(evidence).toHaveTextContent("미확인 · 0/1 일");
    expect(evidence).toHaveTextContent("반영 대기");
    expect(evidence).toHaveTextContent("1/1 일");
    expect(evidence.querySelectorAll(".pmc-history__note")).toHaveLength(3);
    expect(evidence.querySelector(".pmc-history__note")).toBeVisible();
  });

  it("puts chart modes before the plot and labels selected aggregate values", () => {
    const { container } = renderPanel();
    expect(screen.getByTestId("K1-2-2").compareDocumentPosition(screen.getByTestId("K1-2-3")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "180일" }));
    expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("선택 구간");
    expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("평균");
  });
  it("keeps a pending latest day unknown rather than copying an earlier confirmed snapshot", () => {
    const { container } = renderPanel([
      { ...point("2026-09-05", 49.4), calculationStatus: "server" },
      { ...point("2026-09-06"), ctl: null, atl: null, tsb: null, calculationStatus: "pending", loadStatus: "unconfirmed" },
    ]);
    const selectedValues = container.querySelector(".pmc-history__value-strip")!;
    expect(selectedValues).toHaveTextContent("2026-09-06");
    expect(selectedValues).not.toHaveTextContent("49.4");
    expect(within(selectedValues as HTMLElement).getAllByText("—")).toHaveLength(3);
    expect(screen.getByTestId("K1-2-8")).toHaveTextContent("훈련 부하 반영 대기");
  });
  it("shows load snapshot coverage separately from estimated PMC and updates same-day totals", () => {
    const morning: PmcHistoryPoint = { ...point("2026-09-06", 40, 40), loadStatus: "snapshot", calculationStatus: "estimated" };
    const view = renderPanel([morning]);
    const table = screen.getByTestId("K1-2-7");
    expect(within(table).getByText("집계됨 · 1/1 일")).toBeInTheDocument();
    expect(within(table).getByText("추정 계산")).toBeInTheDocument();
    expect(screen.queryByText("저장된 훈련 이력")).not.toBeInTheDocument();
    view.rerender(<PmcHistoryPanel points={[{ ...morning, dailyLoad: 70, calculationStatus: "derived" }]} today={morning.date} canonical />);
    expect(within(table).getByText("70.0")).toBeInTheDocument();
    expect(within(table).getByText("종목 합산")).toBeInTheDocument();
    view.rerender(<PmcHistoryPanel points={[{ ...morning, loadStatus: "unconfirmed" }]} today={morning.date} canonical />);
    expect(within(table).getByText("미확인 · 0/1 일")).toBeInTheDocument();
    expect(within(table).getByText("1/1 일")).toBeInTheDocument();
  });

  it("changes day/week/month granularity and keeps navigation synchronized with the value strip", () => {
    const { container } = renderPanel();
    expect(screen.getByText("컨디션 변화")).toBeInTheDocument();
    expect(screen.queryByText(/실적 \+ 예측/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-pmc-today-marker="true"]')).toBeInTheDocument();
    expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("장기체력 CTL");
    expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("단기피로 ATL");
    expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("회복상태 TSB");
    const ranges = within(screen.getByTestId("K1-2-1"));
    const plot = within(screen.getByTestId("K1-2-3"));
    const trendChart = plot.getByRole("img");
    const trendPoint = { x: 0, y: 0, matrixTransform: () => ({ x: trendPoint.x, y: trendPoint.y }) };
    Object.defineProperty(trendChart, "createSVGPoint", { value: () => trendPoint });
    Object.defineProperty(trendChart, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
    fireEvent.pointerDown(trendChart, { clientX: 44, clientY: 40 });
    fireEvent.pointerUp(trendChart, { clientX: 44, clientY: 40 });
    // 선택 구간은 그래프를 눌러 고른다(날짜 드롭다운·이전·다음·최신 구간 버튼 없음).
    expect(screen.queryByTestId("K1-2-4")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const pickAt = (x: number) => { trendPoint.x = x; fireEvent.pointerDown(trendChart, { clientX: x, clientY: 40 }); fireEvent.pointerUp(trendChart, { clientX: x, clientY: 40 }); };
    pickAt(100000);
    expect(ranges.getByRole("button", { name: "90일" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("2026-09-06 – 2026-09-06")).toHaveLength(1);
    const initialSelectionX = container.querySelector('[data-pmc-selection="true"] line')?.getAttribute("x1");
    pickAt(44);
    expect(container.querySelector('[data-pmc-selection="true"] line')?.getAttribute("x1")).not.toBe(initialSelectionX);
    fireEvent.click(ranges.getByRole("button", { name: "180일" }));
    expect(screen.getByText("주평균")).toBeInTheDocument();
    expect(container.querySelector('[data-pmc-today-marker="true"]')).not.toBeInTheDocument();
    expect(container.querySelector(".pmc-history__value-strip strong")).toHaveTextContent("주평균");
    expect(screen.queryByRole("button", { name: "최신 구간" })).not.toBeInTheDocument();
    const chart = plot.getByRole("img");
    expect(chart).toHaveAccessibleName(/주평균/);
    fireEvent.pointerMove(chart, { clientX: 400, clientY: 10 });
    expect(screen.getByText("장기체력 CTL · 주평균")).toBeInTheDocument();
    fireEvent.click(ranges.getByRole("button", { name: "3년" }));
    expect(screen.getByText("월평균")).toBeInTheDocument();
    expect(container.querySelector(".pmc-history__value-strip strong")).toHaveTextContent("월평균");
    const table = screen.getByTestId("K1-2-7");
    expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("45.0");
    expect(within(table).getByText("—")).toBeInTheDocument();
    expect(within(table).getByText(/2\/6 일 · 부분 집계/)).toBeInTheDocument();
  });

  it("uses the supplied six-option page-controlled range selector", () => {
    const onControlledRangeChange = vi.fn();
    const choices = [42, 90, 180, 365, "3y", "all"] as const;
    const view = renderWithProviders(<PmcHistoryPanel points={points} today="2026-09-06" canonical controlledRange={42} onControlledRangeChange={onControlledRangeChange} rangeChoices={choices} />);
    expect(screen.getByText("일별")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "회복 상태 · 독립 축" })).toHaveAttribute("aria-valuemax", "42");
    expect(screen.getByRole("button", { name: "90일" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6주" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "1년" }));
    expect(onControlledRangeChange).toHaveBeenCalledWith(365);
    fireEvent.click(screen.getByRole("button", { name: "3년" }));
    expect(onControlledRangeChange).toHaveBeenCalledWith("3y");

    view.rerender(<PmcHistoryPanel points={points} today="2026-09-06" canonical controlledRange="3y" onControlledRangeChange={onControlledRangeChange} rangeChoices={choices} />);
    expect(screen.getByRole("button", { name: "3년" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("월평균")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(onControlledRangeChange).toHaveBeenCalledWith("all");

    view.rerender(<PmcHistoryPanel points={points} today="2026-09-06" canonical controlledRange={365} onControlledRangeChange={onControlledRangeChange} rangeChoices={choices} />);
    expect(screen.getByText("주평균")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3년" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "1년" })).toHaveAttribute("aria-pressed", "true");
  });

  it("compares current and previous years by month and never substitutes missing data with zero", () => {
    const { container } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "연도별 비교" }));
    expect(screen.getByRole("button", { name: "2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2025" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('[data-series="2025-ctl"] path')).toHaveAttribute("stroke-dasharray", "8 4");
    for (const [year, ctl, atl] of [["2026", "45.0", "50.0"], ["2025", "30.0", "35.0"]]) {
      const metrics = screen.getByRole("group", { name: new RegExp(`^${year} · .*평균$`) });
      expect(metrics.querySelector('[data-pmc-metric="ctl"]')).toHaveTextContent(`${ctl}장기체력 CTL`);
      expect(metrics.querySelector('[data-pmc-metric="atl"]')).toHaveTextContent(`${atl}단기피로 ATL`);
      expect(metrics.querySelector('[data-pmc-metric="tsb"]')).toHaveTextContent("-5.0회복상태 TSB");
      expect(within(metrics).getByText(ctl!)).toBeVisible();
    }
    expect(container.querySelector(".pmc-history__value-strip [data-pmc-metric]")).not.toBeInTheDocument();
    selectSliderAt(screen.getAllByRole("slider")[0]!, 9);
    expect(screen.getAllByText("기록 없음")).toHaveLength(2);
    expect(screen.getByTestId("K1-2-7")).toHaveTextContent("—");
    expect(screen.getByTestId("K1-2-7").querySelectorAll(".pmc-history__evidence-grid dd")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    expect(screen.getByRole("status")).toHaveTextContent("비교할 연도를 선택하세요");
  });

  it("keeps fallback load unknown and clears stale metrics on empty updates", () => {
    const view = renderPanel();
    expect(within(screen.getByTestId("K1-2-7")).getByText("—")).toBeInTheDocument();
    view.rerender(<PmcHistoryPanel points={[point("2026-09-06", 75)]} today="2026-09-06" canonical={false} />);
    expect(screen.getByText("제한된 활동 기반 이력")).toBeInTheDocument();
    expect(view.container.querySelector(".pmc-history__value-strip")).toHaveTextContent("75.0");
    view.rerender(<PmcHistoryPanel points={[]} today="2026-09-06" canonical={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("이 구간에 표시할 PMC 계산값이 없습니다");
    expect(screen.queryByText("75.0")).not.toBeInTheDocument();
  });

  it("prioritizes failed, stale and pending source states while preserving an override label", () => {
    const base = point("2026-09-06") as PmcHistoryPoint;
    const view = renderPanel([{ ...base, calculationStatus: "pending" }]);
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("훈련 부하 반영 대기");
    expect(screen.getByText("훈련 부하 반영 대기")).toHaveClass("pmc-history__source--progress");
    view.rerender(<PmcHistoryPanel points={[{ ...base, calculationStatus: "pending" }, { ...base, date: "2026-09-05", calculationStatus: "stale" }]} today="2026-09-06" canonical />);
    expect(screen.getByText("PMC 처리 지연")).toHaveClass("pmc-history__source--warning");
    view.rerender(<PmcHistoryPanel points={[{ ...base, calculationStatus: "pending" }, { ...base, date: "2026-09-05", calculationStatus: "stale" }, { ...base, date: "2026-09-04", calculationStatus: "failed" }]} today="2026-09-06" canonical />);
    expect(screen.getByText("PMC 계산 실패")).toHaveClass("pmc-history__source--danger");
    view.rerender(<PmcHistoryPanel points={[{ ...base, calculationStatus: "failed" }]} today="2026-09-06" canonical sourceLabel="직접 지정" />);
    expect(screen.getByText("직접 지정")).toHaveAttribute("data-source-state", "failed");
  });

  it("keeps all six period choices available through shared controls", () => {
    renderPanel();
    const controls = screen.getByRole("group", { name: "표시 기간" });
    expect(within(controls).getAllByRole("button")).toHaveLength(6);
    for (const button of within(controls).getAllByRole("button")) expect(button).toBeEnabled();
  });

  it("puts period controls before the plot without repeating the current-state summary", () => {
    const { container } = renderPanel();
    const range = screen.getByRole("group", { name: "표시 기간" });
    const chart = container.querySelector(".pmc-history__trend-stack");
    expect(range.compareDocumentPosition(chart!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(container.querySelector(".pmc-history__latest")).toBeNull();
    expect(screen.getAllByRole("heading", { name: "컨디션 변화" })).toHaveLength(1);
    expect(container.querySelector(".pmc-history__navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "오늘" })).not.toBeInTheDocument();
  });

  it("keeps selected values keyed to the plotted series and emphasizes the independent zero baseline", () => {
    const { container } = renderWithProviders(<PmcHistoryPanel points={points} today="2026-09-06" canonical ctlColor="var(--color-brand-bike)" />);
    expect(screen.getByRole("heading", { name: "컨디션 변화" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "표시 기간" })).toHaveTextContent("일별");
    expect(container.querySelector(".pmc-history__values [data-pmc-metric='ctl']")).toHaveStyle({ borderInlineStartColor: "var(--color-brand-bike)" });
    expect(container.querySelector(".pmc-history__values [data-pmc-metric='atl']")).toHaveStyle({ borderInlineStartColor: "var(--rose)" });
    expect(container.querySelector(".pmc-history__values [data-pmc-metric='tsb']")).toHaveStyle({ borderInlineStartColor: "var(--amber)" });
    expect(container.querySelector('[data-tsb-zero-axis="true"]')).toHaveClass("pmc-history__zero-axis");
    expect(container.querySelector(".pmc-history__zero-label")).toHaveTextContent("0");
  });

  it("supports every range and keeps distinct year styles with no fatigue overlay clutter", () => {
    const { container } = renderPanel([point("2022-09-06"), point("2024-09-06"), ...points]);
    for (const [name, unit] of [["30일", "일별"], ["90일", "일별"], ["180일", "주평균"], ["360일", "주평균"], ["3년", "월평균"], ["전체", "월평균"]]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByText(unit)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "연도별 비교" }));
    for (const year of ["2022", "2023", "2024"]) fireEvent.click(screen.getByRole("button", { name: year }));
    const lines = [...container.querySelectorAll('[data-series$="-ctl"] path')];
    expect(lines).toHaveLength(5);
    expect(new Set(lines.map((line) => line.getAttribute("stroke-dasharray"))).size).toBe(5);
    expect(container.querySelector('[data-series$="-atl"]')).not.toBeInTheDocument();
  });

  it("reuses the canonical PMC renderer for the combined trend and keeps year comparison specialized", () => {
    const { container } = renderPanel();
    expect(screen.getByRole("region", { name: "컨디션 변화" })).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-pmc-series]")).toHaveLength(3);
    expect(container.querySelector('svg[role="img"] [data-pmc-series="tsb"]')).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "회복 상태 · 독립 축" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "연도별 비교" }));
    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("uses a symmetric independent TSB scale and synchronizes hover, tap, and keyboard selection", () => {
    const data: PmcHistoryPoint[] = [
      { ...point("2026-09-04", 200), tsb: -7 },
      { ...point("2026-09-05", 210), tsb: null },
      { ...point("2026-09-06", 220), tsb: 13 },
    ];
    const { container } = renderPanel(data);
    const main = screen.getByRole("img");
    const tsb = screen.getByRole("slider", { name: "회복 상태 · 독립 축" });
    expect(tsb).toHaveAttribute("viewBox", "0 0 800 112");
    expect(container.querySelector('[data-tsb-zero-axis="true"]')).toHaveAttribute("y1", "48");
    expect(container.querySelector('[data-pmc-series="tsb"]')?.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    const svgPoint = { x: 0, y: 0, matrixTransform: () => ({ x: svgPoint.x, y: svgPoint.y }) };
    for (const chart of [main, tsb]) {
      Object.defineProperty(chart, "createSVGPoint", { value: () => svgPoint });
      Object.defineProperty(chart, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
    }
    fireEvent.pointerMove(main, { clientX: 48, clientY: 20 });
    expect(container.querySelector('[data-pmc-hover="true"] line')).toHaveAttribute("x1", container.querySelector('[data-tsb-cursor="true"]')?.getAttribute("x1"));
    expect(document.querySelectorAll('[data-pmc-tooltip="true"]')).toHaveLength(1);
    expect(document.querySelectorAll("[data-pmc-tooltip-metric]")).toHaveLength(3);
    fireEvent.pointerDown(tsb, { clientX: 48, clientY: 20 });
    fireEvent.pointerUp(tsb, { clientX: 48, clientY: 20 });
    expect(sliderIndex(tsb)).toBe(0);
    expect(tsb).toHaveFocus();
    expect(tsb.getAttribute("aria-valuetext")).toMatch(/장기체력 CTL.*단기피로 ATL.*회복상태 TSB/);
    fireEvent.pointerLeave(main);
    for (const index of [0, 44, 89]) {
      selectSliderAt(tsb, index);
      expect(container.querySelector('[data-pmc-selection="true"] line')).toHaveAttribute("x1", container.querySelector('[data-tsb-cursor="true"]')?.getAttribute("x1"));
    }
    fireEvent.pointerDown(tsb, { clientX: 48, clientY: 20 });
    fireEvent.pointerUp(tsb, { clientX: 70, clientY: 20 });
    expect(sliderIndex(tsb)).toBe(89);
    selectSliderAt(tsb, 0);
    fireEvent.pointerMove(tsb, { clientX: 400, clientY: 20, pointerType: "touch" });
    expect(document.querySelector('[data-pmc-tooltip="true"]')).not.toBeInTheDocument();
    fireEvent.pointerDown(tsb, { clientX: 48, clientY: 20, pointerType: "touch" });
    fireEvent.pointerCancel(tsb, { clientX: 70, clientY: 42, pointerType: "touch" });
    fireEvent.pointerUp(tsb, { clientX: 70, clientY: 42, pointerType: "touch" });
    expect(sliderIndex(tsb)).toBe(0);
    fireEvent.keyDown(tsb, { key: "End" });
    expect(sliderIndex(tsb)).toBe(89);
  });

  it("labels every compared year in the hover tooltip", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "연도별 비교" }));
    const slider = screen.getByRole("slider");
    const svgPoint = { x: 0, y: 0, matrixTransform: () => ({ x: svgPoint.x, y: svgPoint.y }) };
    Object.defineProperty(slider, "createSVGPoint", { value: () => svgPoint });
    Object.defineProperty(slider, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
    fireEvent.pointerMove(slider, { clientX: 580, clientY: 10 });
    const tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByText(/2026 · CTL/)).toBeInTheDocument();
    expect(within(tooltip).getByText(/2025 · CTL/)).toBeInTheDocument();
  });
});
