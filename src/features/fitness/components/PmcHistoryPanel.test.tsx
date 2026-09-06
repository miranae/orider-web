import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { FitnessPoint } from "../../../utils/fitnessMetrics";
import PmcHistoryPanel from "./PmcHistoryPanel";

const point = (date: string, ctl = 40, dailyLoad = 60): FitnessPoint => ({ date, ctl, atl: ctl + 5, tsb: -5, dailyLoad });
const points = [point("2023-09-06"), point("2025-09-06", 30), point("2026-09-05"), point("2026-09-06", 50, 0)];
const renderPanel = (data = points) => renderWithProviders(<PmcHistoryPanel points={data} today="2026-09-06" canonical />);

describe("PmcHistoryPanel", () => {
  it("changes day/week/month granularity and synchronizes keyboard selection across charts", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "90일" })).toHaveAttribute("aria-pressed", "true");
    const sliders = screen.getAllByRole("slider");
    fireEvent.keyDown(sliders[0], { key: "ArrowLeft" });
    expect(sliders[0].getAttribute("aria-valuenow")).toBe(sliders[1].getAttribute("aria-valuenow"));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("2026-09-05");
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("2026-09-06");
    fireEvent.click(screen.getByRole("button", { name: "180일" }));
    expect(screen.getByText(/주평균 ·/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3년" }));
    expect(screen.getByText(/월평균 ·/)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("45.0")).toBeInTheDocument();
    expect(within(table).getByText("60.0")).toBeInTheDocument();
    expect(within(table).getByText(/2\/6 일 · 부분 집계/)).toBeInTheDocument();
  });

  it("compares current and previous years by month and never substitutes missing data with zero", () => {
    const { container } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "연도별 비교" }));
    expect(screen.getByRole("button", { name: "2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2025" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('[data-series="2025-ctl"] path')).toHaveAttribute("stroke-dasharray", "8 4");
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
    expect(screen.getByRole("status")).toHaveTextContent("이 구간에 표시할 기록이 없습니다");
    expect(screen.queryByText("75.0")).not.toBeInTheDocument();
  });

  it("supports every range and keeps distinct year styles with no fatigue overlay clutter", () => {
    const { container } = renderPanel([point("2022-09-06"), point("2024-09-06"), ...points]);
    for (const [name, unit] of [["30일", "일별"], ["90일", "일별"], ["180일", "주평균"], ["360일", "주평균"], ["3년", "월평균"], ["전체", "월평균"]]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByText(new RegExp(`${unit} ·`))).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "연도별 비교" }));
    for (const year of ["2022", "2023", "2024"]) fireEvent.click(screen.getByRole("button", { name: year }));
    const lines = [...container.querySelectorAll('[data-series$="-ctl"] path')];
    expect(lines).toHaveLength(5);
    expect(new Set(lines.map((line) => line.getAttribute("stroke-dasharray"))).size).toBe(5);
    expect(container.querySelector('[data-series$="-atl"]')).not.toBeInTheDocument();
  });

  it("breaks paths across missing days and dynamically contains extreme metric values", () => {
    const { container } = renderPanel([point("2026-09-04", 5000), point("2026-09-06", -900)]);
    const path = container.querySelector('[data-series$="-ctl"] path')?.getAttribute("d") ?? "";
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).not.toContain("L");
    for (const circle of container.querySelectorAll("circle")) {
      expect(Number(circle.getAttribute("cy"))).toBeGreaterThanOrEqual(16);
      expect(Number(circle.getAttribute("cy"))).toBeLessThanOrEqual(166);
    }
  });
});
