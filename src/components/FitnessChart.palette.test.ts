import { createElement } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import FitnessChart from "./FitnessChart";
import { PMC_LINE_PALETTE } from "../features/fitness/chartPalette";

describe("FitnessChart semantic samples", () => {
  it("repeats solid, dashed, and dotted patterns beside readable tooltip metrics", () => {
    renderWithProviders(createElement(FitnessChart, { data: [{ date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 60 }] }));
    fireEvent.focus(screen.getByRole("img"));
    const tooltip = screen.getByRole("tooltip");
    for (const metric of ["ctl", "atl", "tsb"] as const) {
      const sample = tooltip.querySelector(`[data-pmc-tooltip-sample="${metric}"]`);
      expect(sample).toBeInTheDocument();
      if (PMC_LINE_PALETTE[metric].dasharray) expect(sample).toHaveAttribute("stroke-dasharray", PMC_LINE_PALETTE[metric].dasharray);
      else expect(sample).not.toHaveAttribute("stroke-dasharray");
      expect(tooltip.querySelector(`[data-pmc-tooltip-metric="${metric.toUpperCase()}"]`)).toHaveTextContent(metric.toUpperCase());
    }
  });
});
