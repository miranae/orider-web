import userEvent from "@testing-library/user-event";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicActivityComments from "./PublicActivityComments";
import type { createPublicActivityClient } from "../../services/publicActivityDetail";
const row = (id: string, text = id) => ({ id, text, userId: "viewer", nickname: "라이더", profileImage: null, createdAt: 100 });
const client = { comments: vi.fn(), editComment: vi.fn(), deleteComment: vi.fn(), reportComment: vi.fn() };
const revoked = vi.fn();
const renderList = (initial = [row("c1")]) => render(<PublicActivityComments activityId="ride" userId="viewer" initialComments={initial} count={8} client={client as unknown as ReturnType<typeof createPublicActivityClient>} onAccessRevoked={revoked} />, { wrapper: MemoryRouter });
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); client.comments.mockResolvedValue({ comments: [row("c1"), row("c2")], nextCursor: "opaque-2", scannedCount: 2 }); });
describe("paged public comments", () => {
  it("keeps an unnamed comment author link accessible", async () => {
    renderList([{ ...row("unnamed"), nickname: " " }]);
    expect(screen.getByRole("link", { name: "라이더" })).toHaveAttribute("href", "/ko/athlete/viewer");
  });
  it("uses opaque cursors, deduplicates pages and links author profiles", async () => {
    renderList();
    expect(screen.getByRole("link", { name: "라이더" })).toHaveAttribute("href", "/ko/athlete/viewer");
    fireEvent.click(screen.getByRole("button", { name: "댓글 더 보기" }));
    await screen.findByText("c2");
    client.comments.mockResolvedValueOnce({ comments: [row("c2"), row("c3")], nextCursor: null, scannedCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: "댓글 더 보기" }));
    await screen.findByText("c3");
    expect(screen.getAllByText("c2")).toHaveLength(1);
    expect(client.comments).toHaveBeenLastCalledWith("ride", "opaque-2");
    expect(screen.queryByRole("button", { name: "댓글 더 보기" })).not.toBeInTheDocument();
  });
  it("keeps the edit draft on failure and uses the server-confirmed text on success", async () => {
    client.editComment.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ commentId: "c1", text: "수정됨" });
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "수정됨" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue("수정됨");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    expect(screen.getByText("수정됨")).toBeInTheDocument();
  });
  it("requires explicit deletion confirmation", async () => {
    client.deleteComment.mockResolvedValue({ deleted: true });
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(client.deleteComment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));
    await waitFor(() => expect(screen.queryByText("c1")).not.toBeInTheDocument());
  });
  it("preserves loaded comments and restarts after a stale cursor", async () => {
    client.comments.mockRejectedValueOnce({ code: "functions/failed-precondition" });
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "댓글 더 보기" }));
    await screen.findByRole("alert");
    expect(screen.getByText("c1")).toBeInTheDocument();
    expect(revoked).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "처음부터 다시 불러오기" }));
    await screen.findByText("c2");
    expect(client.comments).toHaveBeenLastCalledWith("ride", null);
  });
  it("removes access through the parent on permission revocation", async () => {
    client.comments.mockRejectedValueOnce({ code: "functions/permission-denied" });
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "댓글 더 보기" }));
    await waitFor(() => expect(revoked).toHaveBeenCalledOnce());
  });
  it("discards a late page after unmount", async () => {
    let resolve!: (data: unknown) => void;
    client.comments.mockReturnValue(new Promise(r => { resolve = r; }));
    const view = renderList();
    fireEvent.click(screen.getByRole("button", { name: "댓글 더 보기" }));
    view.unmount();
    await act(async () => resolve({ comments: [row("late")], nextCursor: null }));
    expect(revoked).not.toHaveBeenCalled();
  });
});

it("restores keyboard focus after comment editing and focuses a stable list after deletion", async () => {
  const user = userEvent.setup();
  client.editComment.mockResolvedValue({ text: "수정 완료" });
  client.deleteComment.mockResolvedValue({ deleted: true });
  renderList();
  await user.tab();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("textbox")).toHaveFocus();
  await user.tab();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "수정" })).toHaveFocus();
  await user.keyboard("{Enter}");
  await user.tab();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("button", { name: "수정" })).toHaveFocus());
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "삭제 확인" })).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.queryByText("수정 완료")).not.toBeInTheDocument());
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toContainElement(screen.getByRole("button", { name: "댓글 더 보기" }));
  await user.tab();
  expect(screen.getByRole("button", { name: "댓글 더 보기" })).toHaveFocus();
});

it("does not resurrect a confirmed deletion from stale parent or page data and resets on account change", async () => {
  client.deleteComment.mockResolvedValue({ deleted: true });
  const make = (userId = "viewer") => <PublicActivityComments activityId="ride" userId={userId} initialComments={[row("c1")]} count={8} client={client as unknown as ReturnType<typeof createPublicActivityClient>} onAccessRevoked={revoked} />;
  const view = render(make(), { wrapper: MemoryRouter });
  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));
  await waitFor(() => expect(screen.queryByText("c1")).not.toBeInTheDocument());
  view.rerender(make());
  expect(screen.queryByText("c1")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "댓글 더 보기" }));
  await screen.findByText("c2");
  expect(screen.queryByText("c1")).not.toBeInTheDocument();
  view.rerender(make("other-viewer"));
  expect(screen.getByText("c1")).toBeInTheDocument();
});

it("keeps an in-flight deletion valid when the same account receives a refreshed preview", async () => {
  let resolve!: (value: { deleted: boolean }) => void;
  client.deleteComment.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const make = () => <PublicActivityComments activityId="ride" userId="viewer" initialComments={[row("c1")]} count={8} client={client as unknown as ReturnType<typeof createPublicActivityClient>} onAccessRevoked={revoked} />;
  const view = render(make(), { wrapper: MemoryRouter });
  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));
  view.rerender(make());
  await act(async () => resolve({ deleted: true }));
  expect(screen.queryByText("c1")).not.toBeInTheDocument();
});
