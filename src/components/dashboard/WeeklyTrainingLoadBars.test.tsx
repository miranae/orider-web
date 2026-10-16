import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WeeklyTrainingLoadBars, { type WeeklyTssBar } from "./WeeklyTrainingLoadBars";

const weeks: WeeklyTssBar[] = [
  { week: "10/5", distance: 205, tss: 10, tssEstimated: false, tssUnknownCount: 0 },
  { week: "10/12", distance: 410, tss: 20, tssEstimated: false, tssUnknownCount: 0 },
];

describe("weekly distance scale", () => {
  it.each([true, false])("shows the existing distance maximum and zero baseline with training load %s", showTrainingLoad => {
    render(<WeeklyTrainingLoadBars weeks={weeks} metric="distance" showTrainingLoad={showTrainingLoad} tooltipFor={() => ""} />);
    const scale = within(screen.getByTestId("weekly-distance-scale"));
    expect(scale.getByText("410 km")).toBeInTheDocument();
    expect(scale.getByText("0")).toBeInTheDocument();
    const bars = screen.getAllByTestId("weekly-distance-bar");
    expect(bars[0]).toHaveStyle({ height: "50%" });
    expect(bars[1]).toHaveStyle({ height: "100%" });
    fireEvent.pointerEnter(bars[1]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("410");
  });

  it("uses the same distance formatter as the card and does not invent an unavailable maximum", () => {
    const props = { weeks, metric: "distance" as const, showTrainingLoad: false, tooltipFor: () => "", distanceFormatter: (value: number) => `${value * 1000} m` };
    const view = render(<WeeklyTrainingLoadBars {...props} />);
    expect(within(screen.getByTestId("weekly-distance-scale")).getByText("410000 m")).toBeInTheDocument();
    view.rerender(<WeeklyTrainingLoadBars {...props} coverage="unavailable" />);
    expect(within(screen.getByTestId("weekly-distance-scale")).getByText("—")).toBeInTheDocument();
    expect(screen.getAllByTestId("weekly-distance-bar-unknown")).toHaveLength(2);
  });
});
