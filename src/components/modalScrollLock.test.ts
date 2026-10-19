import { createElement } from "react";
import { render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTrainingDialog } from "./training/useTrainingDialog";
import Modal from "./Modal";

describe("modal and sheet scroll locking", () => {

  it.each([false, true])("locks an open Modal and restores styles when closed (accessible=%s)", accessible => {
    const previousPosition = document.body.style.position;
    const previousOverflow = document.body.style.overflow;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const props = { open: true, onClose: vi.fn(), title: "Modal", accessible, children: createElement("button", null, "Action") };
    const view = render(createElement(Modal, props));
    try {
      expect(document.body.style.position).toBe("fixed");
      expect(document.body.style.overflow).toBe("hidden");
      view.rerender(createElement(Modal, { ...props, open: false }));
      expect(document.body.style.position).toBe(previousPosition);
      expect(document.body.style.overflow).toBe(previousOverflow);
      expect(scrollTo).toHaveBeenCalled();
    } finally {
      view.unmount();
      scrollTo.mockRestore();
    }
  });

  it("locks the body through the training dialog and restores its previous styles on close", () => {
    const previousPosition = document.body.style.position;
    const previousOverflow = document.body.style.overflow;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useTrainingDialog(() => undefined, false));

    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.position).toBe(previousPosition);
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(scrollTo).toHaveBeenCalled();
    scrollTo.mockRestore();
  });
});
