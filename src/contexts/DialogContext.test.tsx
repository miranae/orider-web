import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import i18n from "i18next";
import enCommon from "../i18n/resources/en/common.json";
import { useTrainingDialog } from "../components/training/useTrainingDialog";
import { DialogProvider, useDialog } from "./DialogContext";

function Harness() {
  const dialog = useDialog();
  const [result, setResult] = useState("none");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          setResult(String(await dialog.confirm("Delete this item?", { destructive: true })));
        }}
      >
        confirm
      </button>
      <button
        type="button"
        onClick={async () => {
          setResult((await dialog.prompt("Nickname", { defaultValue: "rider" })) ?? "null");
        }}
      >
        prompt
      </button>
      <output>{result}</output>
    </>
  );
}

describe("DialogProvider", () => {
  const originalLanguage = Object.getOwnPropertyDescriptor(navigator, "language");
  afterEach(async () => {
    if (originalLanguage) Object.defineProperty(navigator, "language", originalLanguage);
    else Reflect.deleteProperty(navigator, "language");
    await i18n.changeLanguage("ko");
  });
  beforeEach(async () => {
    i18n.addResourceBundle("en", "common", enCommon, true, true);
    await i18n.changeLanguage("ko");
  });

  it("uses the selected app language even when browser language differs and updates an open dialog", async () => {
    Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" });
    render(<DialogProvider><Harness /></DialogProvider>);
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("확인");
    expect(within(dialog).getByRole("button", { name: "확인", exact: true })).toBeTruthy();
    await act(() => i18n.changeLanguage("en"));
    expect(dialog).toHaveAccessibleName("Confirm");
    expect(within(dialog).getByRole("button", { name: "OK", exact: true })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Cancel", exact: true })).toBeTruthy();
  });

  it("focuses safe cancel, traps both Tab directions, rejects background focus, and restores the trigger on Escape", async () => {
    render(<DialogProvider><Harness /></DialogProvider>);
    const trigger = screen.getByRole("button", { name: "confirm" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const cancel = within(dialog).getByRole("button", { name: "취소" });
    const accept = within(dialog).getByRole("button", { name: "확인" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(accept).toHaveFocus();
    fireEvent.keyDown(accept, { key: "Tab" });
    expect(cancel).toHaveFocus();
    screen.getByRole("button", { name: "prompt" }).focus();
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Escape" });
    await waitFor(() => expect(screen.getByText("false")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("lets a nested shared confirmation own focus and Escape before the underlying editor", async () => {
    const closeEditor = vi.fn();
    function Editor() {
      const ref = useTrainingDialog(closeEditor, false);
      return <div ref={ref} role="dialog" aria-label="Editor"><Harness /></div>;
    }
    render(<DialogProvider><Editor /></DialogProvider>);
    const trigger = screen.getByRole("button", { name: "confirm" });
    trigger.focus(); fireEvent.click(trigger);
    const confirm = screen.getByRole("dialog", { name: "확인" });
    const cancel = within(confirm).getByRole("button", { name: "취소" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Escape" });
    await waitFor(() => expect(screen.getByText("false")).toBeInTheDocument());
    expect(closeEditor).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(closeEditor).toHaveBeenCalledOnce();
  });

  it.each(["click", "Escape"] as const)("focuses the awaited confirm-to-prompt-to-alert sequence and acknowledges with %s", async acknowledgement => {
    function Sequence() {
      const dialog = useDialog();
      const [closed, setClosed] = useState(false);
      return <><button onClick={async () => {
        if (!await dialog.confirm("Continue?")) return;
        await dialog.prompt("Name", { defaultValue: "sequence rider" });
        await dialog.alert("Finished");
        setClosed(true);
      }}>sequence</button><output>{closed ? "alert closed" : ""}</output></>;
    }
    render(<DialogProvider><Sequence /></DialogProvider>);
    const trigger = screen.getByRole("button", { name: "sequence" });
    trigger.focus(); fireEvent.click(trigger);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "취소" })).toHaveFocus();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "확인" }));
    const input = await screen.findByDisplayValue("sequence rider");
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "확인" }));
    await screen.findByText("Finished");
    const accept = within(screen.getByRole("dialog")).getByRole("button", { name: "확인" });
    await waitFor(() => expect(accept).toHaveFocus());
    if (acknowledgement === "Escape") fireEvent.keyDown(accept, { key: "Escape" });
    else fireEvent.click(accept);
    await waitFor(() => expect(screen.getByText("alert closed")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps confirm acceptance and backdrop cancellation results", async () => {
    render(<DialogProvider><Harness /></DialogProvider>);
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "확인" }));
    await waitFor(() => expect(screen.getByText("true")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    fireEvent.click(document.querySelector(".app-dialog__backdrop")!);
    await waitFor(() => expect(screen.getByText("false")).toBeInTheDocument());
  });

  it("focuses prompt input, cancels to null on Escape, and restores focus", async () => {
    render(<DialogProvider><Harness /></DialogProvider>);
    const trigger = screen.getByRole("button", { name: "prompt" });
    trigger.focus(); fireEvent.click(trigger);
    const input = screen.getByDisplayValue("rider");
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.getByText("null")).toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });


  it("confirm resolves false when cancelled", async () => {
    render(
      <DialogProvider>
        <Harness />
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel|취소/i }));

    await waitFor(() => expect(screen.getByText("false")).toBeTruthy());
  });

  it("prompt resolves typed text", async () => {
    render(
      <DialogProvider>
        <Harness />
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "prompt" }));
    fireEvent.change(screen.getByDisplayValue("rider"), { target: { value: "new rider" } });
    fireEvent.click(screen.getByRole("button", { name: /ok|확인/i }));

    await waitFor(() => expect(screen.getByText("new rider")).toBeTruthy());
  });
});
