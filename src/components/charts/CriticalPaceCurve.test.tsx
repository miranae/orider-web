import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("4:00")).toBeInTheDocument();
  });

  it("renders the previous curve alone when no recent points exist", () => {
    const { container } = render(<CriticalPaceCurve prevPoints={[
      { durationSec: 60, paceSecPerKm: 270 },
      { durationSec: 300, paceSecPerKm: 280 },
    ]} />);

    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelector("path")).toHaveAttribute("stroke-dasharray", "5 4");
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(screen.getByText("4:30")).toBeInTheDocument();
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
