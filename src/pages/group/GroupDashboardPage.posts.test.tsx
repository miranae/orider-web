import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, ensureAppCheckReady } from "../../services/firebase";
import { updateGroupPost } from "../../hooks/useGroupPosts";
import GroupDashboardPage from "./GroupDashboardPage";

const state = vi.hoisted(() => ({
  uid: "owner", role: "leader" as string | null, creatorId: "owner", authorId: "owner",
  showToast: vi.fn(), posts: [{ id: "post-1", content: "Original announcement", authorId: "owner", authorName: "Original author", kind: "announcement", createdAt: 1 }],
}));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: state.uid } }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: state.showToast }) }));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "group-1", creatorId: state.creatorId, name: "QA group", memberCount: 2 }, loading: false }),
  useGroupMemberRole: () => ({ role: state.role }),
  useGroupMembers: () => ({ members: [], loading: false }),
}));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({ rides: [], loading: false, aggregate: null }) }));
vi.mock("../../hooks/useGroupPosts", () => ({
  useGroupPosts: () => ({ posts: state.posts.map((post) => ({ ...post, authorId: state.authorId })), loading: false }),
  createGroupPost: vi.fn(), updateGroupPost: vi.fn(),
}));
vi.mock("../../components/group/GroupSubNav", () => ({ default: () => null }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
function Page() { return <MemoryRouter initialEntries={["/group/group-1"]}><Routes><Route path="/group/:groupId" element={<GroupDashboardPage />} /></Routes></MemoryRouter>; }
function edit() {
  fireEvent.click(screen.getByRole("button", { name: "수정", exact: true }));
  return screen.getByRole("textbox", { name: "게시글 내용 수정" });
}
beforeEach(() => {
  state.uid = "owner"; state.role = "leader"; state.creatorId = "owner"; state.authorId = "owner";
  state.showToast.mockReset();
  vi.mocked(updateGroupPost).mockReset().mockResolvedValue(undefined);
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  Object.assign(auth, { currentUser: { uid: "owner" } });
});
describe("group post editing", () => {
  it("loads original content and updates only content through the protected callable", async () => {
    render(<Page />);
    expect(edit()).toHaveValue("Original announcement");
    fireEvent.change(screen.getByRole("textbox", { name: "게시글 내용 수정" }), { target: { value: "Updated announcement" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(updateGroupPost).toHaveBeenCalledWith({ groupId: "group-1", postId: "post-1", content: "Updated announcement" }));
    expect(state.showToast).toHaveBeenCalledWith("게시글을 수정했습니다.");
    expect(screen.queryByRole("textbox", { name: "게시글 내용 수정" })).not.toBeInTheDocument();
    expect(screen.getByText("Original author")).toBeInTheDocument();
  });
  it("retains the draft on server rejection and shows a localized error", async () => {
    vi.mocked(updateGroupPost).mockRejectedValue(new Error("permission-denied"));
    render(<Page />); edit();
    fireEvent.change(screen.getByRole("textbox", { name: "게시글 내용 수정" }), { target: { value: "Retry draft" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(state.showToast).toHaveBeenCalledWith("게시글을 수정하지 못했습니다.", "error"));
    expect(screen.getByRole("textbox", { name: "게시글 내용 수정" })).toHaveValue("Retry draft");
  });
  it.each([
    ["member", "other", false], ["member", "owner", true], ["co-leader", "other", true], [null, "owner", false],
  ])("matches author/manager authority for role %s and author %s", (role, authorId, allowed) => {
    state.role = role; state.creatorId = "another-leader"; state.authorId = authorId;
    render(<Page />);
    expect(screen.queryByRole("button", { name: "수정", exact: true }) !== null).toBe(allowed);
  });
  it("cancels without sending changes and disables empty content", () => {
    render(<Page />); const box = edit();
    fireEvent.change(box, { target: { value: " " } });
    expect(screen.getByRole("button", { name: "수정 저장" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(updateGroupPost).not.toHaveBeenCalled();
    expect(screen.getByText("Original announcement")).toBeInTheDocument();
  });
  it.each(["account-change", "role-revocation", "unmount"])("does not dispatch a pending edit after %s", async (change) => {
    let ready!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    const view = render(<Page />); edit();
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    expect(updateGroupPost).not.toHaveBeenCalled();
    if (change === "account-change") Object.assign(auth, { currentUser: { uid: "another-user" } });
    if (change === "role-revocation") { state.role = null; view.rerender(<Page />); }
    if (change === "unmount") view.unmount();
    await act(async () => ready());
    expect(updateGroupPost).not.toHaveBeenCalled();
    expect(state.showToast).not.toHaveBeenCalled();
  });
  it("does not revive an old pending edit when a revoked role is restored", async () => {
    let ready!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    const view = render(<Page />); edit();
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    state.role = null; view.rerender(<Page />);
    state.role = "leader"; view.rerender(<Page />);
    await act(async () => ready());
    expect(updateGroupPost).not.toHaveBeenCalled();
    expect(state.showToast).not.toHaveBeenCalled();
  });
  it("waits for App Check before dispatching a still-current edit", async () => {
    let ready!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    render(<Page />); edit();
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    expect(updateGroupPost).not.toHaveBeenCalled();
    await act(async () => ready());
    expect(updateGroupPost).toHaveBeenCalledWith({ groupId: "group-1", postId: "post-1", content: "Original announcement" });
    expect(state.showToast).toHaveBeenCalledWith("게시글을 수정했습니다.");
  });
  it("fails closed when App Check readiness rejects", async () => {
    vi.mocked(ensureAppCheckReady).mockRejectedValue(new Error("app-check/token-timeout"));
    render(<Page />); edit(); fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(state.showToast).toHaveBeenCalledWith("게시글을 수정하지 못했습니다.", "error"));
    expect(updateGroupPost).not.toHaveBeenCalled();
  });
});
