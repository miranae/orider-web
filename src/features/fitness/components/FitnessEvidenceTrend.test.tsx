import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FitnessEvidenceTrend } from "./FitnessEvidenceTrend";

const points = [
  { key: "2026-08", label: "2026-08-01 – 2026-08-31", value: 51.4, unit: "ml/kg/min", detail: "August: observed estimate, cycling, FTP / body mass" },
  { key: "2026-09", label: "2026-09-01 – 2026-09-30", value: 53.1, unit: "ml/kg/min", detail: "September: observed estimate, cycling, FTP / body mass" },
];

describe("FitnessEvidenceTrend", () => {
  it("reveals full observation, units and source detail through focus and keyboard navigation", () => {
    render(<FitnessEvidenceTrend title="VO₂max" points={points} description="Monthly stored estimates" />);
    const chart = screen.getByRole("group", { name: "VO₂max" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.focus(chart);
    expect(screen.getByRole("status")).toHaveTextContent("2026-09-01 – 2026-09-30");
    expect(screen.getByRole("status")).toHaveTextContent("53.1 ml/kg/min");
    expect(screen.getByRole("status")).toHaveTextContent("September: observed estimate, cycling, FTP / body mass");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("51.4 ml/kg/min");
    fireEvent.keyDown(chart, { key: "End" });
    expect(screen.getByRole("status")).toHaveTextContent("53.1 ml/kg/min");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByRole("status")).toHaveTextContent("51.4 ml/kg/min");
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByRole("status")).toHaveTextContent("51.4 ml/kg/min");
  });

  it("selects nearest logarithmic duration on hover and tap without changing saved values", () => {
    render(<FitnessEvidenceTrend title="Power" logarithmic points={[
      { key: "5", label: "5 seconds", x: 5, value: 804.7, unit: "W", detail: "Last 90 days" },
      { key: "60", label: "1 minute", x: 60, value: 402.6, unit: "W", detail: "Last 90 days" },
      { key: "3600", label: "1 hour", x: 3600, value: 209.3, unit: "W", detail: "Last 90 days" },
    ]} />);
    const chart = screen.getByRole("group", { name: "Power" });
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({ left: 0, width: 420 } as DOMRect);
    fireEvent.mouseMove(chart, { clientX: 40 });
    expect(screen.getByRole("status")).toHaveTextContent("804.7 W");
    fireEvent.click(chart, { clientX: 380 });
    expect(screen.getByRole("status")).toHaveTextContent("1 hour");
    expect(screen.getByRole("status")).toHaveTextContent("209.3 W");
    expect(screen.getByRole("status")).toHaveTextContent("Last 90 days");
  });

  it("ignores invalid observations and does not fabricate empty or single-point values", () => {
    const { rerender } = render(<FitnessEvidenceTrend title="Power" points={[{ key: "missing", label: "missing", value: NaN, unit: "W" }]} />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    rerender(<FitnessEvidenceTrend title="Power" points={[{ key: "one", label: "5 minutes", value: 0, unit: "W" }]} />);
    fireEvent.focus(screen.getByRole("group"));
    expect(screen.getByRole("status")).toHaveTextContent("0 W");
    rerender(<FitnessEvidenceTrend title="Power" points={[]} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not display a stale detail when the caller switches its data period", () => {
    const { rerender } = render(<FitnessEvidenceTrend title="VO₂max" points={points} />);
    fireEvent.focus(screen.getByRole("group"));
    rerender(<FitnessEvidenceTrend title="VO₂max" points={[{ key: "2026-10", label: "October", value: 50, unit: "ml/kg/min" }]} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("group"), { key: "Home" });
    expect(screen.getByRole("status")).toHaveTextContent("October");
  });

  it("preserves all intermediate duration labels and their logarithmic grid positions", () => {
    const ticks = [
      { x: 5, label: "5s" }, { x: 60, label: "1m" }, { x: 300, label: "5m" },
      { x: 1200, label: "20m" }, { x: 3600, label: "1h" }, { x: 7200, label: "2h" },
    ];
    const { container } = render(<FitnessEvidenceTrend title="Power" logarithmic ticks={ticks} points={[
      { key: "5", x: 5, label: "5 seconds", value: 804, unit: "W" },
      { key: "3600", x: 3600, label: "1 hour", value: 209, unit: "W" },
    ]} />);
    for (const tick of ticks.slice(0, 5)) expect(screen.getByText(tick.label)).toBeVisible();
    expect(screen.queryByText("2h")).not.toBeInTheDocument();
    expect(container.querySelectorAll("line[stroke-dasharray='2 3']")).toHaveLength(5);
    expect(container.querySelector("svg")).toHaveTextContent("804 W");
  });
});
