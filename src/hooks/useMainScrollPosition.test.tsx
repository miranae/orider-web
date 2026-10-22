import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { useMainScrollPosition } from "./useMainScrollPosition";
function Fixture() {
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  useMainScrollPosition(ref);
  return <><button onClick={() => navigate("/analysis")}>Analysis</button><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate("?sport=run")}>Sport</button><button onClick={() => navigate("/analysis#evidence")}>Evidence</button><main tabIndex={-1} ref={ref}><p>{location.pathname}</p>{location.hash && <h2 id="evidence">Evidence target</h2>}</main></>;
}
it("starts a new page at the top, restores Back, and retains same-page query position", () => {
  render(<MemoryRouter initialEntries={["/condition"]}><Fixture /></MemoryRouter>);
  const main = screen.getByRole("main");
  main.scrollTop = 600; fireEvent.scroll(main);
  fireEvent.click(screen.getByText("Analysis"));
  expect(main.scrollTop).toBe(0);
  main.scrollTop = 120; fireEvent.scroll(main);
  fireEvent.click(screen.getByText("Back"));
  expect(main.scrollTop).toBe(600);
  // Simulate content height being ready after POP restoration.
  fireEvent.pointerDown(main);
  fireEvent.click(screen.getByText("Sport"));
  expect(main.scrollTop).toBe(600);
});
it("uses an explicit anchor instead of resetting its new page to zero", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  render(<MemoryRouter initialEntries={["/condition"]}><Fixture /></MemoryRouter>);
  fireEvent.click(screen.getByText("Evidence"));
  await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "start" }));
  expect(screen.getByText("Evidence target")).toBeInTheDocument();
});

function DelayedTarget() {
  const ref = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  useMainScrollPosition(ref);
  return <><button onClick={() => setReady(true)}>Load target</button><main ref={ref} tabIndex={-1}>{ready ? <h2 id="late">Late evidence</h2> : <p>Loading</p>}</main></>;
}
it("waits for a lazy anchor to mount before revealing it", async () => {
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  render(<MemoryRouter initialEntries={["/analysis#late"]}><DelayedTarget /></MemoryRouter>);
  expect(scroll).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Load target"));
  await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "start" }));
});
