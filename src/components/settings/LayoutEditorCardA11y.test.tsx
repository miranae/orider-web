import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DataPageConfig } from "@shared/types/deviceSettings";

vi.mock("../../contexts/DialogContext", () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}));

import { LayoutEditorCard } from "./LayoutEditorCard";

const config: DataPageConfig = {
  pages: [
    { columns: 4, rows: 4, fields: [{ type: "SPEED", col: 0, row: 0, colSpan: 2, rowSpan: 1 }] },
    { columns: 4, rows: 4, fields: [] },
  ],
};

/**
 * 편집기 접근성 (#1943 수용기준 33, #1950).
 *
 * 배치를 마우스로만 고칠 수 있으면 키보드·스크린리더 사용자에게는 이 화면이 없는 것과 같다.
 */
describe("LayoutEditorCard 접근성", () => {
  it("페이지 전환이 탭으로 노출된다", () => {
    render(<LayoutEditorCard config={config} onSave={vi.fn()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("배치된 필드는 키보드로 닿는다", async () => {
    render(<LayoutEditorCard config={config} onSave={vi.fn()} />);

    const cells = screen.getAllByRole("gridcell");
    const placed = cells.find((c) => c.textContent?.trim() && c.textContent !== "+");
    expect(placed).toBeTruthy();
    // div + onClick 이던 시절에는 Tab 으로 닿지 않아 마우스 없이 배치를 고칠 수 없었다.
    expect(placed!.tagName).toBe("BUTTON");
  });

  it("그리드가 지금 보고 있는 페이지를 이름으로 알린다", () => {
    render(<LayoutEditorCard config={config} onSave={vi.fn()} />);

    expect(screen.getByRole("grid").getAttribute("aria-label")).toBeTruthy();
  });

  /** 저장을 막은 상태에서 버튼만 회색이면 이유를 알 수 없다 — 최소한 눌리지는 않아야 한다. */
  it("읽기 전용이면 저장이 눌리지 않는다", async () => {
    const onSave = vi.fn();
    render(<LayoutEditorCard config={config} onSave={onSave} readOnly />);

    const save = screen.getAllByRole("button").find((b) => b.textContent?.includes("저장"));
    if (save) await userEvent.click(save);

    expect(onSave).not.toHaveBeenCalled();
  });
});
