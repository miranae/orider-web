import { useState } from "react";
import userEvent from "@testing-library/user-event";
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


it("keeps focus inside an owned portalled date picker and lets Escape close only the calendar", async () => {
  const { default: DateField } = await import("../redesign/DateField");
  const close = vi.fn();
  function CalendarFixture() {
    const ref = useTrainingDialog(close, false);
    return <div ref={ref}><button>Close owner</button><DateField value="2026-10-14" onChange={vi.fn()} portal /></div>;
  }
  render(<CalendarFixture />);
  const trigger = screen.getByRole("button", { name: /2026/ });
  fireEvent.keyDown(trigger, { key: "Enter" });
  const calendar = screen.getByRole("dialog");
  const day = calendar.querySelector<HTMLButtonElement>('[data-calendar-date="2026-10-14"]')!;
  expect(day).toHaveFocus();
  fireEvent.keyDown(day, { key: "ArrowRight" });
  expect(calendar.querySelector('[data-calendar-date="2026-10-15"]')).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus(); expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});

it("excludes inherited disabled fieldset controls while preserving its first legend and enabled Tab cycle", async () => {
  function DisabledFieldsetFixture() {
    const ref = useTrainingDialog(vi.fn(), false);
    return <div ref={ref}><button>Close detail</button><button>Enabled action</button><fieldset disabled><legend><button>Available legend action</button></legend><button>Inherited disabled action</button><input aria-label="Inherited disabled input" /><legend><button>Second legend disabled action</button></legend></fieldset></div>;
  }
  render(<DisabledFieldsetFixture />);
  const close = screen.getByRole("button", { name: "Close detail" });
  const enabled = screen.getByRole("button", { name: "Enabled action" });
  const legend = screen.getByRole("button", { name: "Available legend action" });
  expect(close).toHaveFocus();
  expect(screen.getByRole("button", { name: "Inherited disabled action" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Second legend disabled action" })).toBeDisabled();
  await userEvent.tab({ shift: true });
  expect(legend).toHaveFocus();
  await userEvent.tab();
  expect(close).toHaveFocus();
  await userEvent.tab();
  expect(enabled).toHaveFocus();
  await userEvent.tab();
  expect(legend).toHaveFocus();
  await userEvent.tab();
  expect(close).toHaveFocus();
});
