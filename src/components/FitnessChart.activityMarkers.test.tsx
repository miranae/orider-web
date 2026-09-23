import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import FitnessChart from "./FitnessChart";

describe("FitnessChart activity markers", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("renders recent activity dates and emphasizes the selected activity", () => {
    const { container } = renderWithProviders(
      <FitnessChart
        data={[
          { date: "2026-08-28", ctl: 40, atl: 44, tsb: -4, dailyLoad: 60 },
          { date: "2026-08-29", ctl: 43, atl: 58, tsb: -15, dailyLoad: 196 },
        ]}
        today="2026-08-29"
        activityMarkers={[
          { activityId: "ride-1", date: "2026-08-29", label: "Ride · 196 TSS", selected: true },
        ]}
      />,
    );

    const marker = container.querySelector('[data-activity-marker="ride-1"]');
    expect(marker).not.toBeNull();
    expect(marker).toHaveAttribute("aria-label", "Ride · 196 TSS");
    expect(marker?.querySelector("circle")).toHaveAttribute("r", "5");
    expect(screen.getByRole("img", { name: /선택한 활동: Ride · 196 TSS/ })).toBeInTheDocument();
  });

  it("breaks canonical PMC paths across missing samples without drawing zero-valued hover points", () => {
    const { container } = renderWithProviders(
      <FitnessChart
        data={[
          { date: "2026-09-04", ctl: 5000, atl: 5005, tsb: -5, dailyLoad: 60 },
          { date: "2026-09-05", ctl: null, atl: null, tsb: null, dailyLoad: null },
          { date: "2026-09-06", ctl: -900, atl: -895, tsb: -5, dailyLoad: 0 },
        ]}
        today="2026-09-06"
      />,
    );

    const path = container.querySelector('[data-pmc-series="ctl"]')?.getAttribute("d") ?? "";
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).not.toContain("L");
    expect(container.querySelector('[data-pmc-fill="ctl"]')?.getAttribute("d")?.match(/Z/g)).toHaveLength(2);
  });

  it("uses instance-scoped SVG paint ids when more than one PMC chart is rendered", () => {
    const data = [{ date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 60 }];
    const { container } = renderWithProviders(<><FitnessChart data={data} /><FitnessChart data={data} /></>);
    const gradientIds = [...container.querySelectorAll("linearGradient")].map((gradient) => gradient.id);
    expect(gradientIds).toHaveLength(2);
    expect(new Set(gradientIds).size).toBe(2);
  });

  it("keeps a full-height readable coordinate system in a narrow container", async () => {
    class NarrowResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([{ target, contentRect: { width: 320 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", NarrowResizeObserver);
    renderWithProviders(<FitnessChart data={[{ date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 60 }]} />);
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("viewBox", "0 0 320 280"));
  });

  it("uses fitness translations for the accessible name instead of exposing raw keys", () => {
    renderWithProviders(<FitnessChart data={[{ date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 60 }]} today="2026-09-06" />);
    const chart = screen.getByRole("img", { name: /퍼포먼스 관리 차트/ });
    expect(chart).toHaveAccessibleName(/선이 위로 갈수록 체력이 쌓이고 있어요/);
    expect(chart).not.toHaveAccessibleName(/pmc\.title|pmc\.interpretation/);
  });

  it("can suppress the today marker for aggregated period points", () => {
    const data = [{ date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 60 }];
    const { container, rerender } = renderWithProviders(<FitnessChart data={data} today="2026-09-06" />);
    expect(container.querySelector('[data-pmc-today-marker="true"]')).toBeInTheDocument();
    rerender(<FitnessChart data={data} today="2026-09-06" showTodayMarker={false} />);
    expect(container.querySelector('[data-pmc-today-marker="true"]')).not.toBeInTheDocument();
  });

  it("labels observed line ends only when the history chart has room", () => {
    const data = [
      { date: "2026-09-05", ctl: 40, atl: 44, tsb: -4, dailyLoad: 50 },
      { date: "2026-09-06", ctl: 42.3, atl: 42.8, tsb: -0.5, dailyLoad: 60 },
    ];
    const view = renderWithProviders(<FitnessChart data={data} chartWidth={1080} showEndLabels visibleMetrics={["ctl", "atl"]} />);
    const ctl = view.container.querySelector('[data-pmc-end-label="ctl"]');
    const atl = view.container.querySelector('[data-pmc-end-label="atl"]');
    expect(ctl).toHaveTextContent("CTL 42.3");
    expect(atl).toHaveTextContent("ATL 42.8");
    expect(Math.abs(Number(ctl?.querySelector("text")?.getAttribute("y")) - Number(atl?.querySelector("text")?.getAttribute("y")))).toBeGreaterThanOrEqual(22);
    view.rerender(<FitnessChart data={data} chartWidth={390} showEndLabels visibleMetrics={["ctl", "atl"]} />);
    expect(view.container.querySelector("[data-pmc-end-label]")).not.toBeInTheDocument();
    view.rerender(<FitnessChart data={[data[0]!, { ...data[1]!, atl: null }]} chartWidth={1080} showEndLabels visibleMetrics={["ctl", "atl"]} />);
    expect(view.container.querySelector('[data-pmc-end-label="ctl"]')).toBeInTheDocument();
    expect(view.container.querySelector('[data-pmc-end-label="atl"]')).not.toBeInTheDocument();
  });

  it("keeps an aggregated tooltip inside a narrow chart", async () => {
    class NarrowResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([{ target, contentRect: { width: 320 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", NarrowResizeObserver);
    const { container } = renderWithProviders(
      <FitnessChart
        data={[
          { date: "2026-09-01", ctl: 38, atl: 42, tsb: -4, dailyLoad: 50 },
          { date: "2026-09-08", ctl: 40, atl: 45, tsb: -5, dailyLoad: 60 },
          { date: "2026-09-15", ctl: 41, atl: 44, tsb: -3, dailyLoad: 55 },
        ]}
        metricQualifier="주평균"
      />,
    );
    const chart = await screen.findByRole("img");
    await waitFor(() => expect(chart).toHaveAttribute("viewBox", "0 0 320 280"));
    const svgPoint = { x: 160, y: 0, matrixTransform: () => ({ x: svgPoint.x, y: svgPoint.y }) };
    Object.defineProperty(chart, "createSVGPoint", { value: () => svgPoint });
    Object.defineProperty(chart, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
    fireEvent.pointerMove(chart, { clientX: 160, clientY: 10 });
    const tooltip = container.querySelector('[data-pmc-tooltip="true"]');
    const x = Number(tooltip?.getAttribute("x"));
    const width = Number(tooltip?.getAttribute("width"));
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(320);
  });

  it("commits taps to the nearest historical point without committing hover or projection indexes", () => {
    const onSelectedIndexChange = vi.fn();
    const { container } = renderWithProviders(<FitnessChart
      data={[
        { date: "2026-09-05", ctl: 38, atl: 42, tsb: -4, dailyLoad: 50 },
        { date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 60 },
      ]}
      projection={[{ date: new Date("2026-09-07T00:00:00").getTime(), ctl: 41, atl: 44, tsb: -3 }]}
      onSelectedIndexChange={onSelectedIndexChange}
    />);
    const chart = screen.getByRole("img");
    const svgPoint = { x: 0, y: 0, matrixTransform: () => ({ x: svgPoint.x, y: svgPoint.y }) };
    Object.defineProperty(chart, "createSVGPoint", { value: () => svgPoint });
    Object.defineProperty(chart, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
    fireEvent.pointerMove(chart, { clientX: 1072, clientY: 40 });
    expect(onSelectedIndexChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(chart, { clientX: 1072, clientY: 40 });
    fireEvent.pointerUp(chart, { clientX: 1072, clientY: 40 });
    expect(onSelectedIndexChange).toHaveBeenCalledWith(1);
    onSelectedIndexChange.mockClear();
    fireEvent.pointerDown(chart, { clientX: 44, clientY: 40, pointerType: "touch" });
    fireEvent.pointerCancel(chart, { clientX: 80, clientY: 80, pointerType: "touch" });
    fireEvent.pointerUp(chart, { clientX: 80, clientY: 80, pointerType: "touch" });
    expect(onSelectedIndexChange).not.toHaveBeenCalled();
    fireEvent.pointerLeave(chart);
    expect(container.querySelector('[data-pmc-tooltip-metric="CTL"]')).not.toBeInTheDocument();
  });
});
