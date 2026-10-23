import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CriticalPaceCurve from "./CriticalPaceCurve";

describe("CriticalPaceCurve", () => {
  it("formats fractional server pace without a 60-second suffix", () => {
    render(<CriticalPaceCurve recentPoints={[{ durationSec: 30, paceSecPerKm: 299.8 }]} />);
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.queryByText("4:60")).not.toBeInTheDocument();
  });

  it("renders supplied pace points using seconds as duration, without a mock previous curve", () => {
    const { container } = render(<CriticalPaceCurve recentPoints={[
      { durationSec: 30, paceSecPerKm: 240 },
      { durationSec: 7200, paceSecPerKm: 300 },
    ]} />);

    const path = container.querySelector("path");
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(path).toHaveAttribute("d", "M40.0 25.0 L1060.0 115.0");
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(within(screen.getByRole("table")).getByText("4:00 /km")).toBeInTheDocument();
  });

  it("renders the previous curve alone when no recent points exist", () => {
    const { container } = render(<CriticalPaceCurve prevPoints={[
      { durationSec: 60, paceSecPerKm: 270 },
      { durationSec: 300, paceSecPerKm: 280 },
    ]} />);

    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelector("path")).toHaveAttribute("stroke-dasharray", "5 4");
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(within(screen.getByRole("table")).getByText("4:30 /km")).toBeInTheDocument();
  });

  it("renders a visible marker for a previous-only singleton", () => {
    const { container } = render(<CriticalPaceCurve prevPoints={[{ durationSec: 60, paceSecPerKm: 270 }]} />);

    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(1);
    const marker = circles[0];
    expect(marker).toHaveAttribute("fill", "var(--ink-3)");
    expect(Number(marker.getAttribute("r"))).toBeGreaterThan(0);
    expect(Number.isFinite(Number(marker.getAttribute("cx")))).toBe(true);
    expect(Number.isFinite(Number(marker.getAttribute("cy")))).toBe(true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders both supplied periods", () => {
    const { container } = render(<CriticalPaceCurve
      recentPoints={[{ durationSec: 30, paceSecPerKm: 240 }]}
      prevPoints={[{ durationSec: 30, paceSecPerKm: 260 }]}
    />);
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it.each([undefined, []])("shows the existing empty message for missing or empty data (%s)", (points) => {
    const { container } = render(<CriticalPaceCurve recentPoints={points} prevPoints={points} />);

    expect(screen.getByRole("status")).toHaveTextContent("아직 표시할 데이터가 없어요");
    expect(container.querySelector("svg")).toBeNull();
  });
});

it("exposes available durations in an accessible table without inventing missing period values", () => {
  render(<CriticalPaceCurve recentPoints={[{ durationSec: 60, paceSecPerKm: 270 }]} prevPoints={[{ durationSec: 300, paceSecPerKm: 300 }]} />);
  expect(screen.getByRole("img")).toHaveAccessibleName();
  const table = screen.getByRole("table");
  expect(table).toHaveTextContent("1m");
  expect(table).toHaveTextContent("4:30 /km");
  expect(table).toHaveTextContent("5:00 /km");
  expect(screen.getAllByRole("cell").filter(cell => cell.textContent === "—")).toHaveLength(2);
});

it("preserves all duration ticks and reference markers as readable HTML alongside period details", () => {
  const { container } = render(<CriticalPaceCurve recentPoints={[{ durationSec: 60, paceSecPerKm: 240 }]} />);
  expect(container.querySelector("svg text")).toBeNull();
  const axis = container.querySelector(".critical-pace-curve__x-axis")!;
  expect(Array.from(axis.children).map(tick => tick.textContent)).toEqual(["30s", "1m", "5m", "10m", "30m", "1h", "2h"]);
  expect(container.querySelector(".critical-pace-curve__y-axis")).toHaveTextContent("/km");
  expect(container.querySelector(".critical-pace-curve__references")).toHaveTextContent("5K · 22m");
  expect(container.querySelector(".critical-pace-curve__references")).toHaveTextContent("10K · 46m");
  expect(container.querySelector(".critical-pace-curve__references")).toHaveTextContent("100m");
  expect(screen.getByText(/개인 기록이나 완주 예측이 아닙니다/)).toBeVisible();
});

it("compares both supplied periods using focus and duration navigation without filling missing values", () => {
  render(<CriticalPaceCurve recentPoints={[{ durationSec: 30, paceSecPerKm: 240 }, { durationSec: 60, paceSecPerKm: 250 }]} prevPoints={[{ durationSec: 30, paceSecPerKm: 260 }, { durationSec: 300, paceSecPerKm: 270 }]} />);
  const chart = screen.getByRole("img");
  fireEvent.focus(chart);
  expect(screen.getByRole("status")).toHaveTextContent("지속시간 · 5m");
  expect(screen.getByRole("status")).toHaveTextContent("—최근 28일");
  expect(screen.getByRole("status")).toHaveTextContent("4:30 /km이전 28일");
  fireEvent.keyDown(chart, { key: "Home" });
  expect(screen.getByRole("status")).toHaveTextContent("4:00 /km최근 28일");
  expect(screen.getByRole("status")).toHaveTextContent("4:20 /km이전 28일");
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(screen.getByRole("status")).toHaveTextContent("지속시간 · 1m");
  expect(screen.getByRole("status")).toHaveTextContent("—이전 28일");
  fireEvent.keyDown(chart, { key: "ArrowLeft" });
  expect(screen.getByRole("status")).toHaveTextContent("지속시간 · 30s");
  fireEvent.keyDown(chart, { key: "End" });
  expect(screen.getByRole("status")).toHaveTextContent("지속시간 · 5m");
  fireEvent.keyDown(chart, { key: "Escape" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
});

it("selects the nearest supplied duration from a pointer or tap click", () => {
  render(<CriticalPaceCurve recentPoints={[{ durationSec: 30, paceSecPerKm: 240 }, { durationSec: 7200, paceSecPerKm: 300 }]} />);
  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 180, width: 400, height: 180, toJSON: () => ({}) });
  fireEvent(chart, new MouseEvent("pointermove", { bubbles: true, clientX: 10 }));
  expect(screen.getByRole("status")).toHaveTextContent("지속시간 · 30s");
  fireEvent(chart, new MouseEvent("pointerdown", { bubbles: true, clientX: 390 }));
  expect(screen.getByRole("status")).toHaveTextContent("지속시간 · 2h");
  expect(screen.getByRole("status")).toHaveTextContent("5:00 /km");
  fireEvent.click(chart, { clientX: 10 });
  expect(screen.getByRole("status")).toHaveTextContent("지속시간 · 30s");
});


it("stable coach readout remains mounted and ignores passive hover and focus", () => {
  render(<CriticalPaceCurve stableSelection recentPoints={[{ durationSec: 30, paceSecPerKm: 240 }, { durationSec: 300, paceSecPerKm: 280 }]} />);
  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 180, width: 400, height: 180, toJSON: () => ({}) });
  const readout = screen.getByRole("status");
  expect(readout).toHaveClass("critical-pace-curve__readout");
  expect(readout).toHaveTextContent("지속시간 · 5m");
  fireEvent(chart, new MouseEvent("pointermove", { bubbles: true, clientX: 10 }));
  fireEvent.focus(chart);
  expect(readout).toHaveTextContent("지속시간 · 5m");
  fireEvent.keyDown(chart, { key: "Home" });
  expect(readout).toHaveTextContent("지속시간 · 30s");
  fireEvent.keyDown(chart, { key: "Escape" });
  expect(screen.getByRole("status")).toBe(readout);
  expect(readout).toHaveTextContent("지속시간 · 5m");
});
