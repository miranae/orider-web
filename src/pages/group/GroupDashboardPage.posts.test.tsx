import { getDoc, getDocs } from "firebase/firestore";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, ensureAppCheckReady } from "../../services/firebase";
import { createGroupPost, updateGroupPost } from "../../hooks/useGroupPosts";
import { setCollectionDocs, setDocData } from "../../__tests__/mocks/firebase";
import GroupDashboardPage from "./GroupDashboardPage";

const state = vi.hoisted(() => ({
  roleError: null as Error | null, retryRole: vi.fn(),
  aggregate: null as { lifetimeDistance: number; lifetimeRideCount: number; longestRideDistance: number } | null,
  ridesLoading: false, ridesError: null as string | null, retryRides: vi.fn(),
  visibility: "public", uid: "owner", role: "leader" as string | null, creatorId: "owner", authorId: "owner",
  showToast: vi.fn(), posts: [{ id: "post-1", content: "Original announcement", authorId: "owner", authorName: "Original author", kind: "announcement", createdAt: 1 }],
}));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: state.uid } }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: state.showToast }) }));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "group-1", creatorId: state.creatorId, name: "QA group", description: "Private introduction", rules: "Private rules", visibility: state.visibility, memberCount: 2 }, loading: false }),
  useGroupMemberRole: () => ({ role: state.role, error: state.roleError, retry: state.retryRole }),
  useGroupMembers: () => ({ members: [], loading: false }),
}));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({ rides: [], loading: state.ridesLoading, error: state.ridesError, retry: state.retryRides, aggregate: state.aggregate }) }));
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
  state.roleError = null; state.retryRole.mockReset();
  state.aggregate = null;
  state.ridesLoading = false; state.ridesError = null; state.retryRides.mockReset();
  state.visibility = "public"; state.uid = "owner"; state.role = "leader"; state.creatorId = "owner"; state.authorId = "owner";
  state.showToast.mockReset();
  vi.mocked(createGroupPost).mockReset().mockResolvedValue(undefined);
  vi.mocked(updateGroupPost).mockReset().mockResolvedValue(undefined);
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  Object.assign(auth, { currentUser: { uid: "owner" } });
});
describe("group post editing", () => {

  it("identifies distance sums and explains the maximum combined group ride", async () => {
    state.aggregate = { lifetimeDistance: 522000, lifetimeRideCount: 3, longestRideDistance: 306600 };
    render(<Page />);
    expect(screen.getByText("522 km")).toBeInTheDocument();
    expect(screen.getByText("306.6 km")).toBeInTheDocument();
    for (const [name, description] of [
      ["누적 합산거리", "활성 클럽 회원의 공개 활동 이동거리를 모두 더한 값입니다."],
      ["1회 최대 합산거리", "공동 기록 1회에 포함된 공개 활동의 이동거리 합산값 중 최대입니다."],
    ]) {
      const trigger = screen.getByLabelText(name, { selector: "button" });
      expect(trigger).toHaveRole("button");
      await act(async () => { trigger.focus(); fireEvent.click(trigger); });
      expect(trigger).toHaveFocus();
      await waitFor(() => expect(trigger).toHaveAttribute("aria-describedby"));
      const tooltip = document.getElementById(trigger.getAttribute("aria-describedby")!);
      expect(tooltip).toHaveRole("tooltip");
      expect(tooltip).toBeVisible();
      expect(tooltip).toHaveTextContent(description);
      expect(trigger).toHaveAccessibleDescription(tooltip!.textContent!);
      await act(async () => { trigger.blur(); });
    }
  });
  it("clears a composer on account change and ignores old account completion",async()=>{
    let finish!:()=>void;vi.mocked(createGroupPost).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
    const view=render(<Page/>);
    fireEvent.change(screen.getByTestId("C1-3-1"),{target:{value:"Old account draft"}});
    fireEvent.click(screen.getByTestId("C1-3-2"));
    await waitFor(()=>expect(createGroupPost).toHaveBeenCalledTimes(1));
    state.uid="new-owner";state.creatorId="new-owner";Object.assign(auth,{currentUser:{uid:"new-owner"}});view.rerender(<Page/>);
    expect(screen.getByTestId("C1-3-1")).toHaveValue("");
    fireEvent.change(screen.getByTestId("C1-3-1"),{target:{value:"New account draft"}});
    await act(async()=>finish());
    expect(screen.getByTestId("C1-3-1")).toHaveValue("New account draft");
    expect(state.showToast).not.toHaveBeenCalled();
  });
  it("preserves a newer composer edit while its submitted snapshot finishes",async()=>{
    let finish!:()=>void;vi.mocked(createGroupPost).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));render(<Page/>);
    fireEvent.change(screen.getByTestId("C1-3-1"),{target:{value:"Submitted"}});fireEvent.click(screen.getByTestId("C1-3-2"));
    fireEvent.change(screen.getByTestId("C1-3-1"),{target:{value:"New draft"}});await act(async()=>finish());
    expect(screen.getByTestId("C1-3-1")).toHaveValue("New draft");
  });
  it("shows a recoverable upcoming-events error instead of silently dropping the section",async()=>{
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("events offline"));render(<Page/>);
    expect(await screen.findByText("다가오는 이벤트를 불러오지 못했습니다.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("C1-4")).getByRole("button",{name:/다시/}));
    await waitFor(()=>expect(screen.queryByText("다가오는 이벤트를 불러오지 못했습니다.")).not.toBeInTheDocument());
  });
  it("keeps an event visible but does not offer registration when my RSVP cannot be read",async()=>{
    setCollectionDocs("events",[{id:"optional-event",info:{name:"Optional event",groupId:"group-1",status:"OPEN",startTime:Date.now()+3600000}}]);
    vi.mocked(getDoc).mockRejectedValueOnce(new Error("participant unavailable"));render(<Page/>);
    expect(await screen.findByRole("link",{name:/Optional event/})).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"이벤트 보기"})).toHaveAttribute("href","/ko/event/optional-event");
    expect(screen.queryByRole("link",{name:"참가 신청"})).not.toBeInTheDocument();
  });
  it("opens the report form as a labeled dialog and closes it without submitting", async () => {
    state.role = "member"; state.creatorId = "another-owner"; state.authorId = "another-author";
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "신고", exact: true }));
    const dialog = await screen.findByRole("dialog", { name: "게시글 신고" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("combobox", { name: "신고 사유" })).toHaveTextContent("기타");
    expect(within(dialog).getByRole("button", { name: "신고 보내기" })).toBeEnabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("cancels a selected report reason without submitting", async () => {
    state.role = "member"; state.creatorId = "another-owner"; state.authorId = "another-author";
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "신고", exact: true }));
    const dialog = await screen.findByRole("dialog", { name: "게시글 신고" });
    fireEvent.click(within(dialog).getByRole("combobox", { name: "신고 사유" }));
    fireEvent.click(screen.getByRole("option", { name: "스팸" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "취소", exact: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.showToast).not.toHaveBeenCalled();
    expect(ensureAppCheckReady).not.toHaveBeenCalled();
  });
  it("does not expose a private club introduction or rules to a nonmember", () => {
    state.role = null; state.visibility = "private";
    render(<Page />);
    expect(screen.getByTestId("C1.private")).toBeInTheDocument();
    expect(screen.queryByText("Private introduction")).not.toBeInTheDocument();
    expect(screen.queryByText("Private rules")).not.toBeInTheDocument();
  });
  it("restores an approval-pending state from the request mirror on page entry", async () => {
    state.role = null;
    setCollectionDocs("users/owner/group_requests", [{ id: "request", groupId: "group-1", status: "pending" }]);
    render(<Page />);
    expect(await screen.findByRole("button", { name: "승인 대기" })).toBeDisabled();
  });
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
    ["member", "other", false], ["member", "owner", false], ["co-leader", "other", true], [null, "owner", false],
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

// Upcoming-event CTA must use the same canonical status contract as the club event list.
describe("club dashboard registration actions", () => {
  it.each(["REGISTERED", "PAID", "CHECKED_IN", "RIDING", "REFUNDED", "CANCELLED", "PENDING", "FUTURE_STATUS"])("renders the correct action for %s", async status => {
    setCollectionDocs("events", [{ id: "event-1", info: { name: "Upcoming fixture", groupId: "group-1", status: "OPEN", startTime: Date.now() + 86400000 } }]);
    setDocData("events/event-1/participants/owner", { status });
    render(<Page />);
    const active = ["REGISTERED", "PAID", "CHECKED_IN", "RIDING"].includes(status);
    expect(await screen.findByRole("link", { name: active ? "확인 · 취소" : "참가 신청" })).toHaveAttribute("href", active ? "/ko/event/event-1" : "/ko/event/event-1/register");
    expect(screen.queryByRole("link", { name: active ? "참가 신청" : "확인 · 취소" })).not.toBeInTheDocument();
  });
});


describe("club statistics failure isolation", () => {
  it.each(["loading", "unavailable", "error"])("keeps independent club content while statistics are %s", async statsState => {
    state.ridesLoading = statsState === "loading";
    state.ridesError = statsState === "loading" ? null : statsState;
    setCollectionDocs("events", [{ id: "event-survives", info: { name: "Independent upcoming event", status: "OPEN", startTime: Date.now() + 86400000 } }]);
    render(<Page />);
    expect(screen.getByText("Private introduction")).toBeInTheDocument();
    expect(screen.getByText("Private rules")).toBeInTheDocument();
    expect(screen.getByText("Original announcement")).toBeInTheDocument();
    expect(await screen.findByText("Independent upcoming event")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "멤버 더보기" })).toBeInTheDocument();
    expect(screen.queryByTestId("C1-1")).not.toBeInTheDocument();
    expect(screen.queryByText("아직 그룹 라이드가 없어요")).not.toBeInTheDocument();
    if (statsState !== "loading") {
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
      expect(state.retryRides).toHaveBeenCalledOnce();
    }
  });
});


describe("club membership lookup failure", () => {
  it("shows a retryable error instead of offering membership join when membership is unconfirmed", () => {
    state.role = null;
    state.roleError = new Error("Membership lookup unavailable");
    render(<Page />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("C1.preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("C1-0-3")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(state.retryRole).toHaveBeenCalledOnce();
  });
});
