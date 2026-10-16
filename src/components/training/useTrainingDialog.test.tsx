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
