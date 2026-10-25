import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotificationCommentTarget } from "./NotificationCommentTarget";
const state = vi.hoisted(() => ({ user: { uid: "viewer", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, comment: vi.fn(), signIn: vi.fn() }));
vi.mock("react-router-dom", async original => ({ ...await original<typeof import("react-router-dom")>(), useParams: () => ({ activityId: "ride" }), useSearchParams: () => [new URLSearchParams("comment=target")] }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, signIn: state.signIn, loading: false }) }));
vi.mock("../../services/webNotifications", () => ({ createWebNotificationClient: () => ({ comment: state.comment }) }));
beforeEach(() => { vi.clearAllMocks(); state.user = { uid: "viewer", isAnonymous: false }; state.comment.mockResolvedValue({ comment: { id: "target", nickname: "작성자", text: "멀리 있는 정확한 댓글" } }); });
afterEach(cleanup);
it("loads an exact comment independently of paginated preview comments", async () => {
  render(<NotificationCommentTarget />); expect(await screen.findByText("멀리 있는 정확한 댓글")).toBeInTheDocument();
  expect(state.comment).toHaveBeenCalledWith("ride", "target");
});
it.each([null, "denied"])("explains deleted/blocked comment %s without stale body", async condition => {
  if (condition === null) state.comment.mockResolvedValue({ comment: null }); else state.comment.mockRejectedValue({ code: "functions/permission-denied" });
  render(<NotificationCommentTarget />);
  expect(await screen.findByText(/댓글이 삭제·숨김/)).toBeInTheDocument(); expect(screen.queryByText("멀리 있는 정확한 댓글")).not.toBeInTheDocument();
});
it("preserves the URL while requesting sign-in and ignores a previous viewer's response", async () => {
  let resolve!: (v: unknown) => void; state.comment.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = render(<NotificationCommentTarget />); state.user = null; view.rerender(<NotificationCommentTarget />);
  fireEvent.click(screen.getByRole("button", { name: "로그인" })); expect(state.signIn).toHaveBeenCalled();
  await act(async () => resolve({ comment: { text: "old private text" } })); expect(screen.queryByText("old private text")).not.toBeInTheDocument();
});
it("clears the displayed comment immediately on safety changes and explains revoked access", async () => {
  render(<NotificationCommentTarget />); await screen.findByText("멀리 있는 정확한 댓글");
  state.comment.mockRejectedValue({ code: "functions/permission-denied" });
  act(() => window.dispatchEvent(new CustomEvent("orider:activity-safety-changed", { detail: { activityId: "ride" } })));
  expect(screen.queryByText("멀리 있는 정확한 댓글")).not.toBeInTheDocument();
  await screen.findByText(/댓글이 삭제·숨김/);
});
it("removes comment text while backgrounded and verifies access on return", async () => {
  render(<NotificationCommentTarget />); await screen.findByText("멀리 있는 정확한 댓글");
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(screen.queryByText("멀리 있는 정확한 댓글")).not.toBeInTheDocument();
  state.comment.mockResolvedValue({ comment: null }); visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await screen.findByText(/댓글이 삭제·숨김/); visibility.mockRestore();
});
