import { fireEvent, render, screen, act } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamDropTarget } from "./teamAssignment";
import { useTeamPointerDrag } from "./useTeamPointerDrag";

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  isPrimary = true;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
function Harness({
  revision = 1,
  enabled = true,
  onDrop = vi.fn(),
  onInterrupted = vi.fn(),
}: {
  revision?: number;
  enabled?: boolean;
  onDrop?: (id: string, target: TeamDropTarget) => void;
  onInterrupted?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const drag = useTeamPointerDrag({
    container,
    revision,
    enabled,
    memberIds: ["a"],
    onDrop,
    onInterrupted,
  });
  return (
    <main
      style={{ overflowY: "auto" }}
      data-testid="scroll"
      data-drop-current={drag.dropTarget ?? "outside"}
    >
      <div ref={container}>
        <button onPointerDown={(e) => drag.start(e, "a")}>handle</button>
        <section data-team-drop="two">
          target<div data-team-member="b">anchor</div>
          <div data-team-member="c">second anchor</div>
        </section>
        <section data-team-drop="">unassigned</section>
        <output>{drag.draggedId ?? "idle"}</output>
        {drag.ghost && (
          <div ref={drag.attachGhost} data-testid="ghost">
            {JSON.stringify(drag.ghost)}
          </div>
        )}
      </div>
    </main>
  );
}
beforeEach(() => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
const begin = (pointerType = "mouse") => {
  fireEvent.pointerDown(screen.getByRole("button"), {
    pointerId: 1,
    button: 0,
    pointerType,
    clientX: 10,
    clientY: 100,
  });
  fireEvent.pointerMove(window, {
    pointerId: 1,
    pointerType,
    clientX: 50,
    clientY: 150,
  });
};
describe("team pointer drag", () => {
  it("captured mouse/touch coordinates identify drop target, including empty unassigned id", () => {
    const drop = vi.fn();
    render(<Harness onDrop={drop} />);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => screen.getByText("target")),
    });
    begin();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 150 });
    expect(drop).toHaveBeenCalledWith("a", { teamId: "two" });
    vi.mocked(document.elementFromPoint).mockReturnValue(
      screen.getByText("unassigned"),
    );
    begin("touch");
    fireEvent.pointerUp(window, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 50,
      clientY: 150,
    });
    expect(drop).toHaveBeenLastCalledWith("a", { teamId: "" });
  });
  it.each(["Escape", "pointercancel", "blur", "outside"])(
    "cleans up %s without modifying draft",
    (reason) => {
      const drop = vi.fn();
      render(<Harness onDrop={drop} />);
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: vi.fn(() => null),
      });
      begin();
      if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" });
      else if (reason === "outside")
        fireEvent.pointerUp(window, {
          pointerId: 1,
          clientX: 60,
          clientY: 160,
        });
      else fireEvent(window, new Event(reason));
      expect(screen.getByText("idle")).toBeInTheDocument();
      expect(screen.queryByTestId("ghost")).not.toBeInTheDocument();
      expect(drop).not.toHaveBeenCalled();
      expect(cancelAnimationFrame).toHaveBeenCalled();
    },
  );
  it("revision interrupts captured drag; unmount removes window listeners", () => {
    const drop = vi.fn(),
      interrupted = vi.fn();
    const view = render(<Harness onDrop={drop} onInterrupted={interrupted} />);
    begin();
    view.rerender(
      <Harness revision={2} onDrop={drop} onInterrupted={interrupted} />,
    );
    expect(interrupted).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("ghost")).not.toBeInTheDocument();
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(drop).not.toHaveBeenCalled();
    begin();
    view.unmount();
    fireEvent.pointerMove(window, { pointerId: 1 });
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
  it("auto-scrolls actual overflow ancestor near its edge and stops its animation", () => {
    let tick: FrameRequestCallback | undefined;
    vi.mocked(requestAnimationFrame).mockImplementation((fn) => {
      tick = fn;
      return 23;
    });
    render(<Harness />);
    const scroll = screen.getByTestId("scroll");
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 300,
    } as DOMRect);
    const scrollBy = vi.fn();
    Object.defineProperty(scroll, "scrollBy", {
      configurable: true,
      value: scrollBy,
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => screen.getByText("target")),
    });
    fireEvent.pointerDown(screen.getByRole("button"), {
      pointerId: 1,
      button: 0,
      clientX: 10,
      clientY: 100,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 20, clientY: 295 });
    act(() => tick?.(0));
    expect(scrollBy).toHaveBeenCalledWith({ top: 17, behavior: "auto" });
    fireEvent(window, new Event("blur"));
    expect(cancelAnimationFrame).toHaveBeenCalledWith(23);
  });
});

it("does not drop a simple press and uses final pointerup hit-test after movement", () => {
  const drop = vi.fn();
  render(<Harness onDrop={drop} />);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => screen.getByText("target")),
  });
  fireEvent.pointerDown(screen.getByRole("button"), {
    pointerId: 1,
    button: 0,
    clientX: 10,
    clientY: 100,
  });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 11, clientY: 101 });
  expect(drop).not.toHaveBeenCalled();
  begin();
  vi.mocked(document.elementFromPoint).mockReturnValue(
    screen.getByText("unassigned"),
  );
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 250 });
  expect(drop).toHaveBeenCalledWith("a", { teamId: "" });
});

it("preserves the grabbed row offset and updates viewport coordinates immediately", () => {
  render(<Harness />);
  const handle = screen.getByRole("button");
  vi.spyOn(handle, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 200,
    width: 300,
    height: 48,
  } as DOMRect);
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    button: 0,
    clientX: 120,
    clientY: 215,
  });
  expect(screen.queryByTestId("ghost")).not.toBeInTheDocument();
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 220, clientY: 315 });
  expect(
    screen.getByTestId("ghost").style.getPropertyValue("--team-drag-x"),
  ).toBe("200px");
  expect(
    screen.getByTestId("ghost").style.getPropertyValue("--team-drag-y"),
  ).toBe("300px");
  expect(JSON.parse(screen.getByTestId("ghost").textContent!)).toEqual({
    width: 300,
    height: 48,
  });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 230, clientY: 350 });
  expect(
    screen.getByTestId("ghost").style.getPropertyValue("--team-drag-x"),
  ).toBe("210px");
  expect(
    screen.getByTestId("ghost").style.getPropertyValue("--team-drag-y"),
  ).toBe("335px");
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 230, clientY: 350 });
  expect(screen.queryByTestId("ghost")).not.toBeInTheDocument();
});

it("refreshes the target under a stationary pointer after wheel scrolling without moving the ghost", () => {
  let tick: FrameRequestCallback | undefined;
  vi.mocked(requestAnimationFrame).mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  render(<Harness />);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => screen.getByText("target")),
  });
  begin();
  const position = screen.getByTestId("ghost").textContent;
  expect(screen.getByTestId("scroll")).toHaveAttribute(
    "data-drop-current",
    "two",
  );
  vi.mocked(document.elementFromPoint).mockReturnValue(
    screen.getByText("unassigned"),
  );
  act(() => tick?.(0));
  expect(screen.getByTestId("scroll")).toHaveAttribute("data-drop-current", "");
  expect(screen.getByTestId("ghost").textContent).toBe(position);
});

it("uses member IDs and the row midpoint for before/after placement; empty space appends", () => {
  const drop = vi.fn();
  render(<Harness onDrop={drop} />);
  const anchor = screen.getByText("anchor");
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
    top: 100,
    height: 60,
  } as DOMRect);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => anchor),
  });
  begin();
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 120 });
  expect(drop).toHaveBeenLastCalledWith("a", {
    teamId: "two",
    anchorId: "b",
    side: "before",
  });
  begin();
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 140 });
  expect(drop).toHaveBeenLastCalledWith("a", {
    teamId: "two",
    anchorId: "b",
    side: "after",
  });
  const second = screen.getByText("second anchor");
  vi.spyOn(second, "getBoundingClientRect").mockReturnValue({
    top: 200,
    height: 60,
  } as DOMRect);
  vi.mocked(document.elementFromPoint).mockReturnValue(
    screen.getByText("target"),
  );
  begin();
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 80 });
  expect(drop).toHaveBeenLastCalledWith("a", {
    teamId: "two",
    anchorId: "b",
    side: "before",
  });
  begin();
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 180 });
  expect(drop).toHaveBeenLastCalledWith("a", {
    teamId: "two",
    anchorId: "c",
    side: "before",
  });
  begin();
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 280 });
  expect(drop).toHaveBeenLastCalledWith("a", { teamId: "two" });
});
