import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import enCommon from "../../i18n/resources/en/common.json";
import { describe, expect, it, vi } from "vitest";
import DisciplineTabs from "./DisciplineTabs";

describe("DisciplineTabs availability", () => {
  it("disables configured sports and skips them in keyboard navigation", () => {
    const onChange = vi.fn();
    render(<MemoryRouter><DisciplineTabs value="bike" onChange={onChange} disabledKeys={["swim"]} /></MemoryRouter>);
    const swim = screen.getByRole("tab", { name: /수영/ });
    expect(swim).toBeDisabled();
    expect(swim).toHaveTextContent("준비 중");
    expect(swim).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(swim);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("tab", { name: "사이클" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("run");
    expect(screen.getByRole("tab", { name: "러닝" })).toHaveFocus();
  });
  it("keeps swimming enabled for other pages by default", () => {
    const onChange = vi.fn();
    render(<MemoryRouter><DisciplineTabs value="bike" onChange={onChange} /></MemoryRouter>);
    const swim = screen.getByRole("tab", { name: "수영" });
    expect(swim).toBeEnabled();
    fireEvent.click(swim);
    expect(onChange).toHaveBeenCalledWith("swim");
  });
});


it("keeps the full English swimming availability label and its wrapping hooks", async () => {
  i18n.addResourceBundle("en", "common", enCommon, true, true);
  await i18n.changeLanguage("en");
  try {
    render(<MemoryRouter><DisciplineTabs value="run" includeTri disabledKeys={["swim"]} /></MemoryRouter>);
    const swim = screen.getByRole("tab", { name: "Swimming · Coming soon" });
    expect(swim).toBeDisabled();
    expect(swim.querySelector("[data-discipline-label]")).toHaveTextContent("Swimming");
    expect(swim.querySelector("[data-discipline-availability] [data-discipline-compact]")).toHaveTextContent("Soon");
    expect(swim.querySelector("[data-discipline-label] > [data-discipline-compact]")).toHaveTextContent("Swim");
    expect(screen.getByRole("tab", { name: "Cycling" }).querySelector("[data-discipline-label] > [data-discipline-compact]")).toHaveTextContent("Bike");
    expect(screen.getByRole("tab", { name: "Running" }).querySelector("[data-discipline-label] > [data-discipline-compact]")).toHaveTextContent("Run");
  } finally { await i18n.changeLanguage("ko"); }
});

it("keeps full English accessible names and historical swimming keyboard access with compact labels", async () => {
  i18n.addResourceBundle("en", "common", enCommon);
  await i18n.changeLanguage("en");
  try {
    const change = vi.fn();
    render(<MemoryRouter><DisciplineTabs includeTri value="bike" onChange={change} /></MemoryRouter>);
    const bike = screen.getByRole("tab", {name: "Cycling"});
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tab", {name: "Swimming"})).toBeEnabled();
    fireEvent.keyDown(bike, {key: "End"});
    expect(change).toHaveBeenLastCalledWith("swim");
    expect(screen.getByRole("tab", {name: "Swimming"})).toHaveFocus();
  } finally { await i18n.changeLanguage("ko"); }
});
