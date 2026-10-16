import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTrainingDialog } from "./training/useTrainingDialog";

function readSource(fileName: string) {
  return readFileSync(join(process.cwd(), "src/components", fileName), "utf8");
}

describe("modal and sheet scroll locking", () => {
  it("applies the iOS-safe body scroll lock hook to modal surfaces", () => {
    const modal = readSource("Modal.tsx");
    const importModal = readSource("mobile/ImportActivityModal.tsx");
    const notifSheet = readSource("mobile/NotifSheet.tsx");
    const addPlanSheet = readSource("training/AddPlanSheet.tsx");

    for (const source of [modal, importModal, notifSheet]) {
      expect(source).toContain("useBodyScrollLock(open)");
      expect(source).toContain('overscrollBehavior: "contain"');
    }

    expect(addPlanSheet).toContain('import { useTrainingDialog } from "./useTrainingDialog"');
    expect(addPlanSheet).toContain("useTrainingDialog(onClose, loading)");
    expect(readSource("training/useTrainingDialog.ts")).toContain("useBodyScrollLock(true)");
    expect(addPlanSheet).toContain("onPointerDown");
    expect(addPlanSheet).toContain("onPointerMove");
    expect(addPlanSheet).toContain("onPointerUp");
    expect(addPlanSheet).toContain('overscrollBehavior: "contain"');
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
