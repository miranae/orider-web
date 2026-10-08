import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CSSCurve from "./CSSCurve";

const points = [
  { distanceM: 50, paceSecPer100m: 60 },
  { distanceM: 5000, paceSecPer100m: 120 },
];

describe("CSSCurve", () => {
  it("formats fractional server pace without a 60-second suffix", () => {
    render(<CSSCurve recentPoints={[{ distanceM: 50, paceSecPer100m: 299.8 }]} />);
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.queryByText("4:60")).not.toBeInTheDocument();
  });

  it("renders supplied distance/pace points without a mock previous curve or CSS marker", () => {
    const { container } = render(<CSSCurve recentPoints={points} />);

    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelector("path")).toHaveAttribute("d", "M44.0 20.0 L1060.0 120.0");
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(screen.queryByText("CSS")).not.toBeInTheDocument();
    expect(screen.getByText("1:00")).toBeInTheDocument();
  });

  it("renders previous points alone without manufacturing recent points", () => {
    const { container } = render(<CSSCurve prevPoints={points} />);

    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelector("path")).toHaveAttribute("stroke-dasharray", "5 4");
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(screen.getByText("1:00")).toBeInTheDocument();
  });

  it("renders a visible marker for a previous-only singleton", () => {
    const { container } = render(<CSSCurve prevPoints={[{ distanceM: 100, paceSecPer100m: 90 }]} />);

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
    const { container } = render(<CSSCurve recentPoints={points} prevPoints={[
      { distanceM: 50, paceSecPer100m: 70 },
    ]} />);
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });

  it.each([undefined, 0, -1, NaN, Infinity])("omits an absent or invalid CSS marker (%s)", (css) => {
    const { container } = render(<CSSCurve css={css} recentPoints={points} />);

    expect(screen.queryByText("CSS")).not.toBeInTheDocument();
    expect(container.querySelector('line[stroke-dasharray="6 4"]')).toBeNull();
  });

  it("renders an explicitly supplied CSS marker within the chart bounds", () => {
    const { container } = render(<CSSCurve css={180} recentPoints={points} />);

    expect(screen.getByText("CSS")).toBeInTheDocument();
    const marker = container.querySelector('line[stroke-dasharray="6 4"]');
    expect(marker).not.toBeNull();
    const markerY = Number(marker?.getAttribute("y1"));
    expect(markerY).toBeGreaterThan(10);
    expect(markerY).toBeLessThan(130);
  });

  it.each([undefined, []])("shows an empty state even when CSS is supplied (%s)", (emptyPoints) => {
    const { container } = render(<CSSCurve css={92} recentPoints={emptyPoints} prevPoints={emptyPoints} />);

    expect(screen.getByRole("status")).toHaveTextContent("아직 표시할 데이터가 없어요");
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByText("CSS")).not.toBeInTheDocument();
  });
});
