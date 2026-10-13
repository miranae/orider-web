import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SegmentGapResponse } from "@shared/segment-distance-time-gap";
import { compareStoredSegmentWindows, type StoredSegmentWindow } from "@shared/segment-distance-time-gap-kernel";
import { syntheticRequest, syntheticResponse } from "../../services/segmentDistanceTimeGap.fixture";
const m = vi.hoisted(() => ({ response: null as SegmentGapResponse | null, state: "idle", inspect: vi.fn(), units: "metric" }));
vi.mock("../../hooks/useSegmentDistanceTimeGap", () => ({ useSegmentDistanceTimeGap: () => ({ ...m, eligible: true }) }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: m.units }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, args?: Record<string, unknown>) => args ? `${key} ${Object.values(args).join(" ")}` : key }) }));
vi.mock("../../components/LocalizedLink", () => ({ LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
import SegmentDistanceTimeGapPanel from "./SegmentDistanceTimeGapPanel";
describe("compact stored segment gap", () => {
  beforeEach(() => { m.response = null; m.state = "idle"; m.units = "metric"; m.inspect.mockReset(); });
  it("does not query until the explicit button and preserves scalar comparison independently", () => {
    render(<SegmentDistanceTimeGapPanel segmentId="s" pair={syntheticRequest.efforts} sourceIdentity="head" />);
    expect(m.inspect).not.toHaveBeenCalled(); expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "timeGap.compare" })); expect(m.inspect).toHaveBeenCalledTimes(1);
  });
  it("rechecks only explicitly and keeps calculation qualifications in a closed disclosure", () => {
    const props = { segmentId: "s", pair: syntheticRequest.efforts, sourceIdentity: "head" };
    const { rerender } = render(<SegmentDistanceTimeGapPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "timeGap.compare" }));
    expect(m.inspect).toHaveBeenCalledTimes(1);
    m.state = "loading"; rerender(<SegmentDistanceTimeGapPanel {...props} />);
    const loading = screen.getByRole("button"); expect(loading).toBeDisabled();
    fireEvent.click(loading); expect(m.inspect).toHaveBeenCalledTimes(1);
    m.state = "available"; m.response = syntheticResponse(); rerender(<SegmentDistanceTimeGapPanel {...props} />);
    expect(m.inspect).toHaveBeenCalledTimes(1);
    const proof = screen.getByText("timeGap.calculationDetails").closest("details")!;
    expect(proof).not.toHaveAttribute("open"); expect(proof).toHaveTextContent("timeGap.calculation");
    expect(screen.getByText("timeGap.basis")).toBeInTheDocument(); expect(screen.getByText("timeGap.sign")).toBeInTheDocument();
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("KST");
    fireEvent.click(screen.getByRole("button", { name: "timeGap.refresh" }));
    expect(m.inspect).toHaveBeenCalledTimes(2);
  });
  it("scrubs the same current geometry locally and distinguishes exact zero with units", () => {
    m.response = syntheticResponse(); m.state = "available"; const marker = vi.fn();
    render(<SegmentDistanceTimeGapPanel segmentId="s" pair={syntheticRequest.efforts} sourceIdentity="head" onMarker={marker} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "0 km · 0 s");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "511" } });
    expect(marker).toHaveBeenLastCalledWith(m.response.comparison!.points[511]!.marker); expect(m.inspect).not.toHaveBeenCalled();
    expect(screen.getAllByRole("link").map(a => a.getAttribute("href"))).toEqual(["/activity/a", "/activity/b"]);
  });
  it("keeps null gaps out of polylines and shows imperial distance without another read", () => {
    m.response = syntheticResponse(); m.state = "available"; m.units = "imperial";
    const c = m.response.comparison!; c.points[250]!.gapSec = null; c.points[250]!.elapsedSec = [null, null];
    const { container } = render(<SegmentDistanceTimeGapPanel segmentId="s" pair={syntheticRequest.efforts} sourceIdentity="head" />);
    expect(container.querySelectorAll("polyline")).toHaveLength(2); expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "0 mi · 0 s"); expect(m.inspect).not.toHaveBeenCalled();
  });
  it("unavailable or changed input never keeps the previous plot", () => {
    m.response = { ...syntheticResponse(), state: "changed_input", reason: "changed_input", comparison: null }; m.state = "changed_input";
    render(<SegmentDistanceTimeGapPanel segmentId="s" pair={syntheticRequest.efforts} sourceIdentity="head" />);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument(); expect(screen.getByRole("status")).toHaveTextContent("timeGap.reasons.changed_input");
  });
  it.each(["unobserved_gap", "plateau"])("does not spread a zero-distance %s across the distance line", kind => {
    const response = syntheticResponse(), sources = response.comparison!.sources;
    const input = (i: number): StoredSegmentWindow => ({ source: sources[i]!, coordinates: Array.from({ length: 11 }, (_, j) => [0, j * .0005]),
      distanceM: Array.from({ length: 11 }, (_, j) => j * 55.6), elapsedSec: Array.from({ length: 11 }, (_, j) => j * 5) });
    const a = input(0), b = input(1);
    a.coordinates.splice(1, 0, [0, 0]); a.distanceM.splice(1, 0, 0);
    a.elapsedSec = [0, ...Array.from({ length: 11 }, (_, j) => (kind === "unobserved_gap" ? 60 : 5) + j * 5)];
    a.source.storedElapsedSec = a.source.observedElapsedSec = a.elapsedSec[a.elapsedSec.length - 1]!;
    b.source.storedElapsedSec = b.source.observedElapsedSec = 50;
    response.comparison = compareStoredSegmentWindows([[0, 0], [0, .005]], [a, b], "b".repeat(64));
    m.response = response; m.state = "available";
    const { container } = render(<SegmentDistanceTimeGapPanel segmentId="s" pair={syntheticRequest.efforts} sourceIdentity="head" />);
    const lines = container.querySelectorAll("polyline"); expect(lines).toHaveLength(2);
    expect(lines[0]!.getAttribute("points")!.split(" ")).toHaveLength(1);
    const marker = container.querySelector(`[data-event="${kind}"]`)!; expect(marker.querySelector("circle")).not.toBeNull();
    if (kind === "unobserved_gap") {
      expect(marker.querySelector("line")).toBeNull(); expect(Number(lines[1]!.getAttribute("points")!.split(",")[0])).toBeGreaterThan(32);
    } else {
      const interval = marker.querySelector("line")!; expect(interval.getAttribute("x1")).toBe(interval.getAttribute("x2"));
      expect(interval.getAttribute("y1")).not.toBe(interval.getAttribute("y2")); expect(lines[1]!.getAttribute("points")!.startsWith("32,")).toBe(true);
    }
  });
});
