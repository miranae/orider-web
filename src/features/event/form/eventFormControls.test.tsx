import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropdownSelect, Input, Textarea } from "../../../theme/components";
import { Field, Toggle, SegmentedPicker } from "./eventFormControls";

describe("event field accessible labels", () => {
  it("connects single text and multiline controls without replacing explicit identifiers", () => {
    render(<><Field label="Event name"><Input id="event-name" /></Field><Field label="Description"><Textarea /></Field></>);
    expect(screen.getByRole("textbox", { name: "Event name" })).toHaveAttribute("id", "event-name");
    expect(screen.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
  });

  it("labels compound controls as a group while retaining each control name", () => {
    render(<Field label="Schedule"><div><Input aria-label="Start date" /><Input aria-label="Start time" /></div></Field>);
    expect(screen.getByRole("group", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Start date" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Start time" })).toBeInTheDocument();
  });

  it("connects a dropdown and preserves the selected-value contract", () => {
    const change = vi.fn();
    render(<Field label="Host club"><DropdownSelect label="Host club" value="a" onChange={change} options={[{ value: "a", label: "Club A" }, { value: "b", label: "Club B" }]} /></Field>);
    fireEvent.click(screen.getByRole("combobox", { name: "Host club" }));
    fireEvent.click(screen.getByRole("option", { name: "Club B" }));
    expect(change).toHaveBeenCalledWith("b");
  });
});


it("gives safety toggles an explicit name while preserving their pressed-state callback", () => {
  const change = vi.fn();
  render(<Toggle label="Cutoff enabled" on onChange={change} />);
  const toggle = screen.getByRole("button", { name: "Cutoff enabled" });
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(toggle).toHaveStyle({ width: "var(--dim-button-height)", height: "var(--dim-button-height)" });
  expect(toggle.querySelector(":scope > span")).toHaveStyle({ width: "32px", height: "18px" });
  fireEvent.click(toggle);
  expect(change).toHaveBeenCalledWith(false);
});


it("keeps full type labels and the existing selection callback in the responsive picker", () => {
  const change = vi.fn();
  render(<SegmentedPicker options={[{ value: "TT", label: "타임트라이얼", sub: "대규모 · 시상" }, { value: "TOUR", label: "Tour", sub: "Ride together" }]} value="TOUR" onChange={change} columns={2} />);
  const timeTrial = screen.getByRole("button", { name: "타임트라이얼 대규모 · 시상" });
  expect(timeTrial.parentElement?.style.gridTemplateColumns).toBe("repeat(var(--event-picker-column-count, 2), minmax(0, 1fr))");
  expect(timeTrial).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(timeTrial);
  expect(change).toHaveBeenCalledExactlyOnceWith("TT");
});
