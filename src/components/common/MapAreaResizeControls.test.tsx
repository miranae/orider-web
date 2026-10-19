import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import MapAreaResizeControls from "./MapAreaResizeControls";

it("exposes the same map size action at both corners and updates its accessible state", () => {
  const onToggle = vi.fn();
  const props = { expanded: false, controlsId: "map", expandLabel: "지도 크게 보기", collapseLabel: "지도 기본 크기로 보기", onToggle };
  const { rerender } = render(<MapAreaResizeControls {...props} />);
  const controls = screen.getAllByRole("button", { name: props.expandLabel });
  expect(controls).toHaveLength(2);
  for (const control of controls) {
    expect(control).toHaveAttribute("aria-controls", "map");
    expect(control).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(control);
  }
  expect(onToggle).toHaveBeenCalledTimes(2);
  rerender(<MapAreaResizeControls {...props} expanded />);
  expect(screen.getAllByRole("button", { name: props.collapseLabel })).toEqual(controls);
  controls.forEach(control => expect(control).toHaveAttribute("aria-expanded", "true"));
});
