import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropdownSelect, Input, Textarea } from "../../../theme/components";
import { Field } from "./eventFormControls";

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
