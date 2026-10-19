import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import ActivityManagementModal from "./ActivityManagementModal";

const input = () => ({ open: true, activityId: "ride", visibility: "everyone" as const, onClose: vi.fn(), onExport: vi.fn(), onDelete: vi.fn(), onVisibilityChange: vi.fn(async () => {}) });

describe("activity management dialog", () => {
  it("offers only unique management actions with one selected visibility", () => {
    renderWithProviders(<ActivityManagementModal {...input()} />);
    expect(screen.getByRole("link", { name: "활동 정보 편집" })).toHaveAttribute("href", "/ko/activity/ride/edit");
    expect(screen.getByRole("button", { name: "내보내기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "전체 공개" })).toBeChecked();
    expect(screen.queryByText("사진 추가")).not.toBeInTheDocument();
    expect(screen.queryByText("코스로 만들기")).not.toBeInTheDocument();
    expect(screen.queryByText("세그먼트 만들기")).not.toBeInTheDocument();
  });

  it("leaves the existing export and destructive-confirm flows to the page", () => {
    const props = input();
    renderWithProviders(<ActivityManagementModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "내보내기" }));
    expect(props.onExport).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("keeps every exit/action disabled while a visibility save is pending", async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const props = { ...input(), onVisibilityChange: vi.fn(() => pending) };
    renderWithProviders(<ActivityManagementModal {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "비공개" }));
    expect(props.onVisibilityChange).toHaveBeenCalledWith("private");
    const edit = screen.getByRole("link", { name: "활동 정보 편집" });
    expect(edit).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(edit);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "내보내기" })).toBeDisabled();
    finish();
    await waitFor(() => expect(edit).not.toHaveAttribute("aria-disabled"));
  });
});
