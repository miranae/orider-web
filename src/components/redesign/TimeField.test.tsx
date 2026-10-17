import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimeField from "./TimeField";

describe("TimeField duration display and optional icon", () => {
  it("keeps ordinary clock fields unchanged", () => {
    render(<TimeField value="06:30" onChange={vi.fn()} presets={false} />);
    expect(screen.getByRole("button")).toHaveTextContent("오전 6:30");
  });
  it("shows elapsed hours/minutes and a supplied SVG while retaining HH:MM updates", () => {
    const onChange = vi.fn();
    render(<TimeField value="06:30" onChange={onChange} duration presets={false} icon={<svg data-testid="time-svg" />} />);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveTextContent("6시간 30분");
    expect(trigger).not.toHaveTextContent("오전");
    expect(trigger).not.toHaveTextContent("🕐");
    expect(screen.getByTestId("time-svg")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("listbox", { name: "시" })).getByRole("option", { name: "07" }));
    expect(onChange).toHaveBeenCalledWith("07:30");
  });
});
