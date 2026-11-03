import { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { useMainScrollPosition } from "./useMainScrollPosition";
import { HUB_RETURN_STATE } from "../services/hubReturn";
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

it("tracks an anchor while earlier content grows and stops when the user takes control", () => {
  let resized: () => void = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} });
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  try {
    render(<MemoryRouter initialEntries={["/analysis#evidence"]}><Fixture /></MemoryRouter>);
    expect(scroll).toHaveBeenCalledOnce();
    act(() => resized());
    expect(scroll).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(screen.getByRole("main"));
    act(() => resized());
    expect(scroll).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});

it("keeps the same feed card offset while late content changes and stops on user input", () => {
  let resized = () => {}; let cardTop = 500;
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} });
  function FeedFixture() {
    const ref = useRef<HTMLElement>(null); const location = useLocation(); const navigate = useNavigate();
    useMainScrollPosition(ref);
    return <><button onClick={() => navigate("/detail")}>Open</button><button onClick={() => navigate(-1)}>Return</button><main ref={ref}>{location.pathname === "/" && <article data-scroll-anchor="ride">Ride</article>}</main></>;
  }
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.scrollAnchor ? cardTop - screen.getByRole("main").scrollTop : 0;
    return { top, bottom: top + 300, left: 0, right: 390, width: 390, height: 300, x: 0, y: top, toJSON: () => ({}) };
  });
  try {
    render(<MemoryRouter><FeedFixture /></MemoryRouter>);
    const main = screen.getByRole("main"); fireEvent.pointerDown(main);
    main.scrollTop = 600; fireEvent.scroll(main);
    fireEvent.click(screen.getByText("Open")); fireEvent.click(screen.getByText("Return"));
    expect(main.scrollTop).toBe(600);
    cardTop = 700; act(() => resized()); expect(main.scrollTop).toBe(800);
    fireEvent.wheel(main); cardTop = 900; act(() => resized()); expect(main.scrollTop).toBe(800);
  } finally { bounds.mockRestore(); vi.unstubAllGlobals(); }
});

function HubFixture() {
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  useMainScrollPosition(ref);
  const back = (to: string) => navigate(to, { state: HUB_RETURN_STATE });
  return <>
    <button onClick={() => navigate("?sport=tri", { replace: true })}>Tri</button>
    <button onClick={() => navigate("?sport=bike", { replace: true })}>Bike</button>
    <button onClick={() => navigate("/")}>Home</button>
    <button onClick={() => back("/coach/condition?sport=tri")}>Coach tri tab</button>
    <button onClick={() => back("/coach/condition?sport=bike")}>Coach bike tab</button>
    <button onClick={() => navigate("/coach/condition?sport=tri")}>Coach link</button>
    <main tabIndex={-1} ref={ref} />
  </>;
}
it("탭으로 돌아오면 그 화면 URL(종목 포함)에서 마지막으로 보던 위치로 되돌리고 일반 이동은 맨 위로 연다", () => {
  render(<MemoryRouter initialEntries={["/coach/condition?sport=bike"]}><HubFixture /></MemoryRouter>);
  const main = screen.getByRole("main");
  main.scrollTop = 500; fireEvent.scroll(main);
  fireEvent.click(screen.getByText("Tri"));
  main.scrollTop = 200; fireEvent.scroll(main);
  fireEvent.click(screen.getByText("Home"));
  expect(main.scrollTop).toBe(0);
  fireEvent.click(screen.getByText("Coach tri tab"));
  expect(main.scrollTop).toBe(200);
  fireEvent.pointerDown(main);
  fireEvent.click(screen.getByText("Home"));
  fireEvent.click(screen.getByText("Coach bike tab"));
  expect(main.scrollTop).toBe(500);
  fireEvent.pointerDown(main);
  fireEvent.click(screen.getByText("Home"));
  fireEvent.click(screen.getByText("Coach link"));
  expect(main.scrollTop).toBe(0);
});
