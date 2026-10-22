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
