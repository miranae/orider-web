import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

    expect(addPlanSheet).toContain("useBodyScrollLock(true)");
    expect(addPlanSheet).toContain("onPointerDown");
    expect(addPlanSheet).toContain("onPointerMove");
    expect(addPlanSheet).toContain("onPointerUp");
    expect(addPlanSheet).toContain('overscrollBehavior: "contain"');
  });
});
