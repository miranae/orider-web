import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupRideOverlayControls } from "./GroupRideOverlayControls";

const overlays = [
  { key: "speed", label: "속도", dotColor: "var(--chart-speed)" },
  { key: "power", label: "파워", dotColor: "var(--chart-power)" },
];

describe("GroupRideOverlayControls", () => {
  it("reflects active overlays and forwards toggle clicks", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <GroupRideOverlayControls
        overlays={overlays}
        activeOverlays={new Set(["speed"])}
        onToggle={onToggle}
        elevationLabel="고도"
      />,
    );

    expect(screen.getByText("고도")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "속도" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "파워" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "파워" }));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("power");

    rerender(
      <GroupRideOverlayControls
        overlays={overlays}
        activeOverlays={new Set(["speed", "power"])}
        onToggle={onToggle}
        elevationLabel="고도"
      />,
    );
    expect(screen.getByRole("button", { name: "파워" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not show controls without performance overlays", () => {
    const { container } = render(
      <GroupRideOverlayControls
        overlays={[]}
        activeOverlays={new Set()}
        onToggle={vi.fn()}
        elevationLabel="고도"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
