import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PublicActivitySafety from "./PublicActivitySafety";
import type { createPublicActivityClient } from "../../services/publicActivityDetail";
const calls = { reportActivity: vi.fn(), hideActivity: vi.fn(), blockAuthor: vi.fn() };
const removed = vi.fn(); const revoked = vi.fn();
const props = { activityId: "ride", authorId: "author", client: calls as unknown as ReturnType<typeof createPublicActivityClient>, onRemoved: removed, onAccessRevoked: revoked };
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);
it("focuses the report note, cancels with Escape and restores the trigger without sending", () => {
  render(<PublicActivitySafety {...props} />);
  const trigger = screen.getByRole("button", { name: "활동 신고" });
  trigger.focus(); fireEvent.click(trigger);
  expect(screen.getByRole("textbox")).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(trigger).toHaveFocus(); expect(calls.reportActivity).not.toHaveBeenCalled();
});
it("preserves failed report text for retry and leaves activity available after a report", async () => {
  calls.reportActivity.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ reportId: "r" });
  render(<PublicActivitySafety {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "활동 신고" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "개인정보" } });
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  await screen.findByRole("alert"); expect(screen.getByRole("textbox")).toHaveValue("개인정보");
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  await screen.findByText("신고를 접수했습니다."); expect(removed).not.toHaveBeenCalled();
  expect(calls.reportActivity).toHaveBeenLastCalledWith("ride", "개인정보");
});
it.each([["활동 숨기기", "hide", "hideActivity", "ride"], ["작성자 차단", "block", "blockAuthor", "author"]] as const)("confirms %s and removes content only after success", async (label, action, method, id) => {
  calls[method].mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  render(<PublicActivitySafety {...props} />);
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  expect(calls[method]).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  await screen.findByRole("alert"); expect(removed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  await waitFor(() => expect(removed).toHaveBeenCalledWith(action)); expect(calls[method]).toHaveBeenCalledWith(id);
});
it("ignores pending success after viewer/activity remount", async () => {
  let resolve!: () => void; calls.hideActivity.mockReturnValue(new Promise<void>(r => { resolve = r; }));
  const view = render(<PublicActivitySafety key="viewer-a" {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "활동 숨기기" })); fireEvent.click(screen.getByRole("button", { name: "확인" }));
  view.rerender(<PublicActivitySafety key="viewer-b" {...props} />);
  await act(async () => resolve()); expect(removed).not.toHaveBeenCalled();
});
it("removes revoked content instead of retaining an editor", async () => {
  calls.reportActivity.mockRejectedValue({ code: "functions/permission-denied" });
  render(<PublicActivitySafety {...props} />); fireEvent.click(screen.getByRole("button", { name: "활동 신고" })); fireEvent.click(screen.getByRole("button", { name: "확인" }));
  await waitFor(() => expect(revoked).toHaveBeenCalled());
});
