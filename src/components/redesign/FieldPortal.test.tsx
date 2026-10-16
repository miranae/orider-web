import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DateField from "./DateField";
import TimeField from "./TimeField";

describe("event picker opt-in portals", () => {
  it("keeps ordinary pickers inline by default", () => {
    const view = render(<div data-testid="clipped"><DateField value="2026-01-31" onChange={vi.fn()} presets={false} /></div>);
    fireEvent.click(screen.getByRole("button"));
    expect(view.container).toContainElement(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toHaveStyle({ position: "absolute", zIndex: 50 });
  });

  it("escapes clipped containers and preserves calendar focus, internal clicks, selection and Escape", async () => {
    const change = vi.fn();
    const view = render(<div style={{ overflow: "hidden", position: "relative", zIndex: 0 }}><DateField portal value="2026-01-31" onChange={change} presets={false} /></div>);
    const trigger = screen.getByRole("button");
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(document.body).toContainElement(dialog);
    expect(view.container).not.toContainElement(dialog);
    expect(dialog).toHaveStyle({ position: "fixed", zIndex: 1000 });
    expect(screen.getByRole("gridcell", { name: "2026-01-31" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{Enter}");
    expect(change).toHaveBeenCalledWith("2026-02-01");
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("gridcell", { name: "2026-01-31" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("clamps both portal pickers in viewport coordinates and repositions on scroll", () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });
    let top = 500;
    const box = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { left: 250, right: 350, top, bottom: top + 40, width: this.getAttribute("role") === "dialog" ? 296 : 100, height: this.getAttribute("role") === "dialog" ? 300 : 40, x: 250, y: top, toJSON: () => ({}) };
    });
    try {
      const view = render(<DateField portal value="2026-01-31" onChange={vi.fn()} presets={false} />);
      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toHaveStyle({ left: "12px", top: "196px" });
      top = 100;
      fireEvent(window, new Event("scroll"));
      expect(screen.getByRole("dialog")).toHaveStyle({ top: "144px" });
      view.unmount();
      top = 500;
      render(<TimeField portal value="06:30" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toHaveStyle({ left: "12px", top: "196px" });
    } finally {
      box.mockRestore();
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    }
  });

  it("keeps portaled time selections open, then restores focus on preset/Escape and closes outside", async () => {
    const change = vi.fn();
    const view = render(<TimeField portal value="06:30" onChange={change} />);
    const trigger = screen.getByRole("button");
    await userEvent.click(trigger);
    expect(view.container).not.toContainElement(screen.getByRole("dialog"));
    expect(within(screen.getByRole("listbox", { name: "시" })).getByRole("option", { name: "06" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(change).toHaveBeenCalledWith("07:30");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "12:00" }));
    expect(change).toHaveBeenCalledWith("12:00");
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
