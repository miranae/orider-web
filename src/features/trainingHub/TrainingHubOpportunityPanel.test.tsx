import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BikeActionAccordion } from "./TrainingHubOpportunityPanel";

const t = (key: string, values?: Record<string, unknown>) => values?.count == null ? key : `${key}:${values.count}`;

describe("BikeActionAccordion progressive disclosure", () => {
  it("shows the highest-priority needed action and folds the rest", () => {
    render(<MemoryRouter><BikeActionAccordion ftp={250} hasPdcModel={false} hasZoneData t={t} /></MemoryRouter>);
    expect(screen.getByText("hub.actions.tte.title")).toBeInTheDocument();
    expect(screen.queryByText("hub.actions.ftp.title")).not.toBeInTheDocument();
    const more = screen.getByRole("button", { name: "hub.actions.showMore:5" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("hub.actions.ftp.title")).toBeInTheDocument();
  });

  it("exposes action expansion state and controlled content", () => {
    render(<MemoryRouter><BikeActionAccordion ftp={null} hasPdcModel hasZoneData t={t} /></MemoryRouter>);
    const action = screen.getByRole("button", { name: /hub.actions.ftp.title/ });
    expect(action).toHaveAttribute("aria-expanded", "true");
    expect(action).toHaveAttribute("aria-controls", "bike-action-ftp");
    const region = screen.getByRole("region", { name: /hub.actions.ftp.title/ });
    fireEvent.click(action);
    expect(action).toHaveAttribute("aria-expanded", "false");
    expect(region).toHaveAttribute("hidden");
    expect(document.getElementById("bike-action-ftp")).toBe(region);
  });

  it("syncs a newly needed async primary but preserves a user's choice on unrelated rerenders", () => {
    const { rerender } = render(<MemoryRouter><BikeActionAccordion ftp={250} hasPdcModel hasZoneData t={t} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /hub.actions.ftp.title/ })).toHaveAttribute("aria-expanded", "true");
    rerender(<MemoryRouter><BikeActionAccordion ftp={250} hasPdcModel={false} hasZoneData t={t} /></MemoryRouter>);
    const tte = screen.getByRole("button", { name: /hub.actions.tte.title/ });
    expect(tte).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(tte);
    expect(tte).toHaveAttribute("aria-expanded", "false");
    rerender(<MemoryRouter><BikeActionAccordion ftp={250} hasPdcModel={false} hasZoneData t={(key, values) => t(key, values)} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /hub.actions.tte.title/ })).toHaveAttribute("aria-expanded", "false");
  });
});
