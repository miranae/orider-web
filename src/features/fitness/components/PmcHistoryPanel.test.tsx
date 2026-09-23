import { fireEvent, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { FitnessPoint } from "../../../utils/fitnessMetrics";
import PmcHistoryPanel from "./PmcHistoryPanel";
import type { PmcHistoryPoint } from "../pmcHistory";

const point = (date: string, ctl = 40, dailyLoad = 60): FitnessPoint => ({ date, ctl, atl: ctl + 5, tsb: -5, dailyLoad });
const points = [point("2023-09-06"), point("2025-09-06", 30), point("2026-09-05"), point("2026-09-06", 50, 0)];
const renderPanel = (data = points) => renderWithProviders(<PmcHistoryPanel points={data} today="2026-09-06" canonical />);

describe("PmcHistoryPanel", () => {
  it("shows load snapshot coverage separately from estimated PMC and updates same-day totals", () => {
    const morning: PmcHistoryPoint = { ...point("2026-09-06", 40, 40), loadStatus: "snapshot", calculationStatus: "estimated" };
    const view = renderPanel([morning]);
    const table = screen.getByRole("table");
    expect(within(table).getByText("집계됨 · 1/1 일")).toBeInTheDocument();
    expect(within(table).getByText("추정 계산")).toBeInTheDocument();
    expect(screen.queryByText("서버 정본 이력")).not.toBeInTheDocument();
    view.rerender(<PmcHistoryPanel points={[{ ...morning, dailyLoad: 70, calculationStatus: "derived" }]} today={morning.date} canonical />);
    expect(within(table).getByText("70.0")).toBeInTheDocument();
    expect(within(table).getByText("종목 합산")).toBeInTheDocument();
    view.rerender(<PmcHistoryPanel points={[{ ...morning, loadStatus: "unconfirmed" }]} today={morning.date} canonical />);
    expect(within(table).getByText("미확인 · 0/1 일")).toBeInTheDocument();
    expect(within(table).getByText("1/1 일")).toBeInTheDocument();
  });

  it("changes day/week/month granularity and keeps navigation synchronized with the value strip", () => {
    const { container } = renderPanel();
    expect(screen.getByText("저장된 PMC 이력")).toBeInTheDocument();
    expect(screen.queryByText(/실적 \+ 예측/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-pmc-today-marker="true"]')).toBeInTheDocument();
    expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("체력 (CTL)");
    expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("피로도 (ATL)");
    expect(container.querySelector(".pmc-history__value-strip")).toHaveTextContent("상태 (TSB)");
    const trendChart = screen.getByRole("img");
    const trendPoint = { x: 0, y: 0, matrixTransform: () => ({ x: trendPoint.x, y: trendPoint.y }) };
    Object.defineProperty(trendChart, "createSVGPoint", { value: () => trendPoint });
    Object.defineProperty(trendChart, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
    fireEvent.pointerDown(trendChart, { clientX: 44, clientY: 40 });
    fireEvent.pointerUp(trendChart, { clientX: 44, clientY: 40 });
    expect(screen.getByRole("combobox")).toHaveValue("0");
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(screen.getByRole("button", { name: "90일" })).toHaveAttribute("aria-pressed", "true");
    const initialSelectionX = container.querySelector('[data-pmc-selection="true"] line')?.getAttribute("x1");
    fireEvent.click(screen.getByRole("button", { name: "이전 구간" }));
    expect(screen.getAllByText("2026-09-05 – 2026-09-05")).toHaveLength(2);
    expect(container.querySelector('[data-pmc-selection="true"] line')?.getAttribute("x1")).not.toBe(initialSelectionX);
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(screen.getAllByText("2026-09-06 – 2026-09-06")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "180일" }));
    expect(screen.getByText("주평균")).toBeInTheDocument();
    expect(container.querySelector('[data-pmc-today-marker="true"]')).not.toBeInTheDocument();
    expect(container.querySelector(".pmc-history__value-strip strong")).toHaveTextContent("주평균");
    expect(screen.getByRole("button", { name: "최신 구간" })).toBeInTheDocument();
    const chart = screen.getByRole("img");
    expect(chart).toHaveAccessibleName(/주평균/);
    fireEvent.pointerMove(chart, { clientX: 400, clientY: 10 });
    expect(screen.getByText("CTL · 주평균")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3년" }));
    expect(screen.getByText("월평균")).toBeInTheDocument();
    expect(container.querySelector(".pmc-history__value-strip strong")).toHaveTextContent("월평균");
    const table = screen.getByRole("table");
    expect(within(table).getByText("45.0")).toBeInTheDocument();
    expect(within(table).getByText("60.0")).toBeInTheDocument();
    expect(within(table).getByText(/2\/6 일 · 부분 집계/)).toBeInTheDocument();
  });

  it("uses a page-controlled range without rendering a competing range selector", () => {
    const onControlledRangeChange = vi.fn();
    const view = renderWithProviders(<PmcHistoryPanel points={points} today="2026-09-06" canonical controlledRange={42} onControlledRangeChange={onControlledRangeChange} />);
    expect(screen.getByText("일별")).toBeInTheDocument();
    expect(screen.getByRole("combobox").querySelectorAll("option")).toHaveLength(42);
    expect(screen.queryByRole("button", { name: "90일" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3년" }));
    expect(onControlledRangeChange).toHaveBeenCalledWith("3y");

    view.rerender(<PmcHistoryPanel points={points} today="2026-09-06" canonical controlledRange="3y" onControlledRangeChange={onControlledRangeChange} />);
    expect(screen.getByRole("button", { name: "3년" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("월평균")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(onControlledRangeChange).toHaveBeenCalledWith("all");

    view.rerender(<PmcHistoryPanel points={points} today="2026-09-06" canonical controlledRange={365} onControlledRangeChange={onControlledRangeChange} />);
    expect(screen.getByText("주평균")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3년" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "360일" })).not.toBeInTheDocument();
  });

  it("compares current and previous years by month and never substitutes missing data with zero", () => {
    const { container } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "연도별 비교" }));
    expect(screen.getByRole("button", { name: "2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2025" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('[data-series="2025-ctl"] path')).toHaveAttribute("stroke-dasharray", "8 4");
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "2026 · 체력 (CTL) 45.0")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "2025 · 체력 (CTL) 30.0")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "9" } });
    expect(screen.getAllByText("기록 없음")).toHaveLength(2);
    expect(screen.getAllByRole("cell").filter((cell) => cell.textContent === "—")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    expect(screen.getByRole("status")).toHaveTextContent("비교할 연도를 선택하세요");
  });

  it("shows actual zero, fallback provenance and empty updates without stale metrics", () => {
    const view = renderPanel();
    expect(within(screen.getByRole("table")).getByText("0.0")).toBeInTheDocument();
    view.rerender(<PmcHistoryPanel points={[point("2026-09-06", 75)]} today="2026-09-06" canonical={false} />);
    expect(screen.getByText("제한된 활동 기반 이력")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("75.0")).toBeInTheDocument();
    view.rerender(<PmcHistoryPanel points={[]} today="2026-09-06" canonical={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("이 구간에 표시할 PMC 계산값이 없습니다");
    expect(screen.queryByText("75.0")).not.toBeInTheDocument();
  });

  it("prioritizes failed, stale and pending source states while preserving an override label", () => {
    const base = point("2026-09-06") as PmcHistoryPoint;
    const view = renderPanel([{ ...base, calculationStatus: "pending" }]);
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("PMC 반영 대기");
    expect(screen.getByText("PMC 반영 대기")).toHaveClass("pmc-history__source--progress");
    view.rerender(<PmcHistoryPanel points={[{ ...base, calculationStatus: "pending" }, { ...base, date: "2026-09-05", calculationStatus: "stale" }]} today="2026-09-06" canonical />);
    expect(screen.getByText("PMC 처리 지연")).toHaveClass("pmc-history__source--warning");
    view.rerender(<PmcHistoryPanel points={[{ ...base, calculationStatus: "pending" }, { ...base, date: "2026-09-05", calculationStatus: "stale" }, { ...base, date: "2026-09-04", calculationStatus: "failed" }]} today="2026-09-06" canonical />);
    expect(screen.getByText("PMC 계산 실패")).toHaveClass("pmc-history__source--danger");
    view.rerender(<PmcHistoryPanel points={[{ ...base, calculationStatus: "failed" }]} today="2026-09-06" canonical sourceLabel="직접 지정" />);
    expect(screen.getByText("직접 지정")).toHaveAttribute("data-source-state", "failed");
  });

  it("uses non-overlapping real 44px range buttons in the mobile grid", () => {
    const css = readFileSync(join(process.cwd(), "src/features/fitness/components/PmcHistoryPanel.css"), "utf8");
    expect(css).toContain(".pmc-history__ranges .ds-btn { height: 44px; min-height: 44px; }");
    expect(css).toContain(".pmc-history__ranges .ds-btn::after { display: none; }");
    expect(css).toContain(".pmc-history__ranges--controlled { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
    expect(css).toContain(".pmc-history__navigation label { grid-column: 1 / -1; }");
    expect(css).toContain(".pmc-history__tsb-chart { display: block; width: 100%; height: auto;");
  });

  it("puts period controls and latest CTL/ATL before the long trend plot", () => {
    const { container } = renderPanel();
    const range = screen.getByRole("group", { name: "표시 기간" });
    const chart = container.querySelector(".pmc-history__trend-stack");
    const latest = container.querySelector(".pmc-history__latest");
    expect(range.compareDocumentPosition(chart!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(latest).toHaveTextContent("최신 구간");
    expect(latest).toHaveTextContent("체력 (CTL) 50.0");
    expect(latest).toHaveTextContent("피로도 (ATL) 55.0");
    expect(latest?.compareDocumentPosition(chart!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(container.querySelector(".pmc-history__navigation label")?.compareDocumentPosition(screen.getByRole("button", { name: "오늘" }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps selected values keyed to the plotted series and emphasizes the independent zero baseline", () => {
    const { container } = renderWithProviders(<PmcHistoryPanel points={points} today="2026-09-06" canonical ctlColor="var(--color-brand-bike)" />);
    const chartHeading = container.querySelector(".pmc-history__chart-heading");
    expect(chartHeading).toHaveTextContent("저장된 PMC 이력");
    expect(chartHeading).toHaveTextContent("일별");
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
    expect(screen.getByRole("region", { name: "훈련 이력 지도" })).toBeInTheDocument();
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
    expect(container.querySelectorAll('[data-pmc-tooltip="true"]')).toHaveLength(1);
    expect(container.querySelectorAll("[data-pmc-tooltip-metric]")).toHaveLength(3);
    fireEvent.pointerDown(tsb, { clientX: 48, clientY: 20 });
    fireEvent.pointerUp(tsb, { clientX: 48, clientY: 20 });
    expect(screen.getByRole("combobox")).toHaveValue("0");
    expect(tsb).toHaveFocus();
    expect(tsb.getAttribute("aria-valuetext")).toMatch(/체력 \(CTL\).*피로도 \(ATL\).*상태 \(TSB\)/);
    fireEvent.pointerLeave(main);
    for (const index of [0, 44, 89]) {
      fireEvent.change(screen.getByRole("combobox"), { target: { value: String(index) } });
      expect(container.querySelector('[data-pmc-selection="true"] line')).toHaveAttribute("x1", container.querySelector('[data-tsb-cursor="true"]')?.getAttribute("x1"));
    }
    fireEvent.pointerDown(tsb, { clientX: 48, clientY: 20 });
    fireEvent.pointerUp(tsb, { clientX: 70, clientY: 20 });
    expect(screen.getByRole("combobox")).toHaveValue("89");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "0" } });
    fireEvent.pointerMove(tsb, { clientX: 400, clientY: 20, pointerType: "touch" });
    expect(container.querySelector('[data-pmc-tooltip="true"]')).not.toBeInTheDocument();
    fireEvent.pointerDown(tsb, { clientX: 48, clientY: 20, pointerType: "touch" });
    fireEvent.pointerCancel(tsb, { clientX: 70, clientY: 42, pointerType: "touch" });
    fireEvent.pointerUp(tsb, { clientX: 70, clientY: 42, pointerType: "touch" });
    expect(screen.getByRole("combobox")).toHaveValue("0");
    fireEvent.keyDown(tsb, { key: "End" });
    expect(screen.getByRole("combobox")).toHaveValue("89");
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
