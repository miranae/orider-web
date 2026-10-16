import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTrainingDialog } from "./training/useTrainingDialog";
import Modal from "./Modal";

function readSource(fileName: string) {
  return readFileSync(join(process.cwd(), "src/components", fileName), "utf8");
}

describe("modal and sheet scroll locking", () => {
  it("applies the iOS-safe body scroll lock hook to modal surfaces", () => {
    const modal = readSource("Modal.tsx");
    const importModal = readSource("mobile/ImportActivityModal.tsx");
    const notifSheet = readSource("mobile/NotifSheet.tsx");
    const addPlanSheet = readSource("training/AddPlanSheet.tsx");

    for (const source of [importModal, notifSheet]) {
      expect(source).toMatch(/useBodyScrollLock\s*\(\s*open\s*\)/);
      expect(source).toContain('overscrollBehavior: "contain"');
    }
    expect(modal).toContain('overscrollBehavior: "contain"');

    expect(addPlanSheet).toContain('import { useTrainingDialog } from "./useTrainingDialog"');
    expect(addPlanSheet).toMatch(/useTrainingDialog(?:\s*<[^>]+>)?\s*\(\s*onClose\s*,\s*loading\s*\)/);
    expect(readSource("training/useTrainingDialog.ts")).toMatch(/useBodyScrollLock\s*\(\s*true\s*\)/);
    expect(addPlanSheet).toContain("onPointerDown");
    expect(addPlanSheet).toContain("onPointerMove");
    expect(addPlanSheet).toContain("onPointerUp");
    expect(addPlanSheet).toContain('overscrollBehavior: "contain"');
  });

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
