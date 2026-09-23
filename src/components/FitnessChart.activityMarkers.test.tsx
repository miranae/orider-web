import { screen, waitFor } from "@testing-library/react";
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
});
