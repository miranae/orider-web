import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { expect, it, vi } from "vitest";
import AnchoredDetailsSection from "./AnchoredDetailsSection";
function Jump() { const navigate = useNavigate(); return <button onClick={() => navigate("/coach/analysis#source")}>Jump</button>; }
it("reveals a descendant hash on navigation without remounting its content", () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  render(<MemoryRouter initialEntries={["/coach/analysis"]}><Jump /><AnchoredDetailsSection title="Evidence"><input id="source" aria-label="Local selection" defaultValue="initial" /></AnchoredDetailsSection></MemoryRouter>);
  const field = screen.getByLabelText("Local selection");
  const details = field.closest("details")!;
  expect(details.open).toBe(false);
  fireEvent.change(field, { target: { value: "retained" } });
  fireEvent.click(screen.getByText("Jump"));
  expect(details.open).toBe(true);
  expect(field).toHaveValue("retained");
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
});
it("opens an explicitly requested decision and leaves unrelated details closed", () => {
  const view = render(<MemoryRouter initialEntries={["/coach/analysis#other"]}><AnchoredDetailsSection id="ftp" title="FTP" requested><p>Decision evidence</p></AnchoredDetailsSection></MemoryRouter>);
  expect(view.container.querySelector("details")).toHaveProperty("open", true);
});

function SelectDetail() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button><button onClick={() => navigate("?detail=analysis-model#source")}>Model detail</button><button onClick={() => navigate("?detail=closed#source")}>Close detail</button><button onClick={() => navigate("#source")}>Legacy hash</button></>;
}
it("opts in to query detail navigation while preserving local content and giving closed precedence over a hash", () => {
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  const view = render(<MemoryRouter initialEntries={["/coach/analysis"]}><SelectDetail /><AnchoredDetailsSection queryDetail id="analysis-model" title="Model"><input id="source" aria-label="Model selection" defaultValue="initial" /></AnchoredDetailsSection><AnchoredDetailsSection queryDetail id="analysis-periods" title="Periods" requested><p>Other evidence</p></AnchoredDetailsSection></MemoryRouter>);
  const field = screen.getByLabelText("Model selection");
  const model = field.closest("details")!;
  const periods = view.container.querySelector("#analysis-periods")!;
  fireEvent.change(field, { target: { value: "retained" } });
  fireEvent.click(screen.getByText("Model detail"));
  expect(model.open).toBe(true);
  expect(periods).toHaveProperty("open", false);
  expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  fireEvent.click(screen.getByText("Close detail"));
  expect(model.open).toBe(false);
  expect(periods).toHaveProperty("open", false);
  expect(field).toHaveValue("retained");
  fireEvent.click(screen.getByText("History back"));
  expect(model.open).toBe(true);
  fireEvent.click(screen.getByText("History forward"));
  expect(model.open).toBe(false);
  fireEvent.click(screen.getByText("Legacy hash"));
  expect(model.open).toBe(true);
  expect(periods).toHaveProperty("open", true);
});
it.each(["analysis-model", "closed", "analysis-periods"])("preserves the legacy default behavior despite detail=%s", detail => {
  const view = render(<MemoryRouter initialEntries={[`/embed?detail=${detail}#source`]}><AnchoredDetailsSection id="legacy" title="Legacy"><p id="source">Legacy source</p></AnchoredDetailsSection><AnchoredDetailsSection id="requested" title="Requested" requested><p>Requested source</p></AnchoredDetailsSection></MemoryRouter>);
  expect(view.container.querySelector("#legacy")).toHaveProperty("open", true);
  expect(view.container.querySelector("#requested")).toHaveProperty("open", true);
});
it("reveals a directly requested category even with an unrelated malformed legacy hash", () => {
  const view = render(<MemoryRouter initialEntries={["/coach/analysis?detail=analysis-model#%E0%A4%A"]}><AnchoredDetailsSection queryDetail id="analysis-model" title="Model"><p>Model evidence</p></AnchoredDetailsSection></MemoryRouter>);
  expect(view.container.querySelector("details")).toHaveProperty("open", true);
});
