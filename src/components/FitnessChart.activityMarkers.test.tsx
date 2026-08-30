import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import FitnessChart from "./FitnessChart";

describe("FitnessChart activity markers", () => {
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
});
