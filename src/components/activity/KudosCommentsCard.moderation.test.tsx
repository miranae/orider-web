import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KudosCommentsCard from "./KudosCommentsCard";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../LocalizedLink", () => ({ LocalizedLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("./useHydratedSocialProfiles", () => ({ useHydratedSocialProfiles: (list: unknown[]) => list }));
vi.mock("../Avatar", () => ({ default: () => null }));
vi.mock("../social/LikersAvatarStack", () => ({ default: () => null }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: async () => true }) }));
const visible = { id: "other-comment", userId: "other", nickname: "Other", profileImage: null, text: "Visible", createdAt: 1 };
const own = { ...visible, id: "own-comment", userId: "owner", text: "Own" };
const hidden = { ...visible, id: "hidden-comment", text: "Hidden secret", hiddenByOwner: true, deletedAt: 12 };
const defaults = { profile: null, liked: false, kudos: [], comments: [visible, own, hidden], commentText: "", setCommentText: vi.fn(), submitting: false,
  editingCommentId: null, setEditingCommentId: vi.fn(), editingText: "", setEditingText: vi.fn(), onToggleKudos: vi.fn(), onSubmitComment: vi.fn(),
  onDeleteComment: vi.fn(), onSaveEditComment: vi.fn(), onSignIn: vi.fn(), formatTimeAgo: () => "now" };
afterEach(cleanup);
describe("comment moderation scopes", () => {
  it("keeps comment keyboard submission and pending protection with the shared input controls", () => {
    const submit = vi.fn(), setText = vi.fn();
    const view = render(<KudosCommentsCard {...defaults} user={{ uid: "viewer" } as never} commentText="긴 한국어 댓글 초안" setCommentText={setText} onSubmitComment={submit} />);
    const input = screen.getByRole("textbox", { name: "kudosCard.ariaInput" });
    fireEvent.change(input, { target: { value: "바뀐 초안" } });
    expect(setText).toHaveBeenCalledWith("바뀐 초안");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(submit).toHaveBeenCalledTimes(1);
    view.rerender(<KudosCommentsCard {...defaults} user={{ uid: "viewer" } as never} commentText="긴 한국어 댓글 초안" submitting onSubmitComment={submit} />);
    expect(screen.getByRole("button", { name: "kudosCard.submitting" })).toBeDisabled();
  });
  it("owner can hide visible comments and restore owner-hidden comments, reporting only others", () => {
    const report = vi.fn(), setHidden = vi.fn();
    render(<KudosCommentsCard {...defaults} user={{ uid: "owner" } as never} activityOwnerId="owner" hiddenComments={[hidden]} onReportComment={report} onSetCommentHidden={setHidden} />);
    expect(screen.getAllByRole("button", { name: "kudosCard.report" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "kudosCard.report" })); expect(report).toHaveBeenCalledWith("other-comment");
    fireEvent.click(screen.getAllByRole("button", { name: "kudosCard.hide" })[0]); expect(setHidden).toHaveBeenCalledWith("other-comment", true);
    fireEvent.click(screen.getByRole("button", { name: "kudosCard.restore" })); expect(setHidden).toHaveBeenCalledWith("hidden-comment", false);
  });
  it("non-owners cannot see owner-hidden text/list or restoration controls", () => {
    render(<KudosCommentsCard {...defaults} user={{ uid: "viewer" } as never} activityOwnerId="owner" hiddenComments={[hidden]} onReportComment={vi.fn()} onSetCommentHidden={vi.fn()} />);
    expect(screen.queryByText(/Hidden secret/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "kudosCard.restore" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "kudosCard.hide" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "kudosCard.report" })).toHaveLength(2);
  });
  it("guests have no report/hide controls and owner-hidden rows remain absent", () => {
    render(<KudosCommentsCard {...defaults} user={null} activityOwnerId="owner" onReportComment={vi.fn()} onSetCommentHidden={vi.fn()} />);
    expect(screen.queryByText(/Hidden secret/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "kudosCard.report" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "kudosCard.hide" })).not.toBeInTheDocument();
  });
});
