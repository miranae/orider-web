import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import DisciplineTabs from "./DisciplineTabs";

function Query() { const [params] = useSearchParams(); return <output>{params.toString()}</output>; }

describe("DisciplineTabs availability", () => {
  it("hides swimming and keeps keyboard navigation on visible sports", () => {
    const onChange = vi.fn();
    render(<MemoryRouter><DisciplineTabs value="bike" onChange={onChange} disabledKeys={["swim"]} /></MemoryRouter>);
    expect(screen.queryByRole("tab", { name: /수영/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "사이클" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("run");
    expect(screen.getByRole("tab", { name: "러닝" })).toHaveFocus();
  });

  it("normalizes an old swimming URL without losing other parameters", () => {
    render(<MemoryRouter initialEntries={["/?sport=swim&year=2026"]}><DisciplineTabs /><Query /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "사이클" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("status")).toHaveTextContent("year=2026");
  });

  it("does not change a controlled stored discipline merely by rendering", () => {
    const onChange = vi.fn();
    render(<MemoryRouter><DisciplineTabs value="swim" onChange={onChange} /></MemoryRouter>);
    expect(screen.queryByRole("tab", { name: /수영/ })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});


it("keeps the first visible sport reachable when the all-sports selection has no tab", () => {
  const onChange = vi.fn();
  render(<MemoryRouter><DisciplineTabs value="tri" onChange={onChange} /></MemoryRouter>);
  const bike = screen.getByRole("tab", { name: "사이클" });
  expect(bike).toHaveAttribute("aria-selected", "false");
  expect(bike).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("tab", { name: "러닝" })).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(bike, { key: "ArrowRight" });
  expect(onChange).toHaveBeenCalledWith("run");
});
