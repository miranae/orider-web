import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import i18n from "i18next";
import enCommon from "../i18n/resources/en/common.json";
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
