import { useState } from "react";
import { DropdownSelect } from "../../theme/components";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useTrainingDialog } from "./useTrainingDialog";

function Fixture() {
  const ref = useTrainingDialog(vi.fn(), false);
  return <div ref={ref}><button>Close</button><details><summary>Intensity</summary><button>Hidden outer term</button><details><summary>Nested glossary</summary><button>Nested term</button></details></details><button disabled>Apply</button></div>;
}
it("traps focus using only summaries and content exposed by every ancestor disclosure", () => {
  render(<Fixture />);
  const close = screen.getByRole("button", { name: "Close" });
  const outer = screen.getByText("Intensity");
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(outer).toHaveFocus();
  fireEvent.keyDown(outer, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.click(outer);
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  const nested = screen.getByText("Nested glossary");
  expect(nested).toHaveFocus();
  fireEvent.click(nested);
  close.focus();
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: "Nested term" })).toHaveFocus();
});

it("focuses the explicit close control before heading glossary triggers", () => {
  function HeadingFixture() {
    const ref = useTrainingDialog(vi.fn(), false);
    return <div ref={ref}><button>About Z1</button><button data-dialog-initial-focus>Close workout</button></div>;
  }
  render(<HeadingFixture />);
  expect(screen.getByRole("button", { name: "Close workout" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "About Z1" })).not.toHaveFocus();
});

it("lets an open portalled combobox consume Escape before closing its containing dialog", () => {
  const close = vi.fn();
  function DropdownFixture() {
    const ref = useTrainingDialog(close, false);
    const [value, setValue] = useState("a");
    return <div ref={ref}><button>Close panel</button><DropdownSelect label="Reason" value={value} onChange={setValue} options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} /></div>;
  }
  render(<DropdownFixture />);
  const combo = screen.getByRole("combobox", { name: "Reason" });
  combo.focus(); fireEvent.keyDown(combo, { key: "ArrowDown" });
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  fireEvent.keyDown(combo, { key: "Escape" });
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(combo).toHaveFocus(); expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(combo, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
it("preserves tooltip Escape priority before closing the containing dialog", () => {
  const close = vi.fn();
  function TooltipFixture() {
    const ref = useTrainingDialog(close, false);
    const [open, setOpen] = useState(true);
    return <div ref={ref}><button onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}>Term</button>{open && <div role="tooltip">Definition</div>}</div>;
  }
  render(<TooltipFixture />);
  const term = screen.getByRole("button", { name: "Term" });
  fireEvent.keyDown(term, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(term, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
