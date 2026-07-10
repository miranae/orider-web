import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useState } from "react";
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
