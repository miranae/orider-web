import { appCheckFailureRecovery } from "../../services/appCheckFailureRecovery";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, setCallableImplementation, setCallableResult, setCollectionDocs, simulateLogin } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady } from "../../services/firebase";
import GroupsPage from "./GroupsPage";

const { publicGroups, myGroups, membershipState, usePublicGroupsMock } = vi.hoisted(() => ({
  membershipState: { snapshot: null as Array<Record<string, unknown>> | null, error: null as unknown, loading: false, pending: new Set<string>(), retry: vi.fn() },
  myGroups: [] as Array<Record<string, unknown>>,
  publicGroups: [] as Array<Record<string, unknown>>,
  usePublicGroupsMock: vi.fn(),
}));

vi.mock("../../hooks/useGroup", () => ({
  useGroupMemberRole: () => ({ role: null, loading: false }),
  useMyGroups: () => ({ groups: membershipState.snapshot ?? myGroups, loading: membershipState.loading, error: membershipState.error, retry: membershipState.retry }),
  usePendingGroupRequestIds: () => membershipState.pending,
  usePublicGroups: (options: unknown) => {
    usePublicGroupsMock(options);
    return { groups: publicGroups, loading: false, error: null, retry: vi.fn() };
  },
}));

vi.mock("../../hooks/useGroupNextEvents", () => ({
  useGroupNextEvents: () => ({ byGroup: new Map(), loading: false }),
}));

function pageRoutes() { return <Routes>
      <Route path="/ko/groups" element={<GroupsPage />} />
      <Route path="/ko/club/:groupId" element={<div>group destination</div>} />
    </Routes>; }
function renderPage(authenticated = true) {
  return renderWithProviders(pageRoutes(), { route: "/ko/groups", authenticated });
}

describe("GroupsPage join results", () => {
  beforeEach(() => {
    vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
    vi.mocked(httpsCallable).mockClear();
    mockCallableInvocations.length = 0;
    Object.assign(auth, { currentUser: { uid: "test-uid" } });
    publicGroups.splice(0); myGroups.splice(0); membershipState.error = null;
    membershipState.snapshot = null;
    membershipState.loading = false; membershipState.pending = new Set(); membershipState.retry = vi.fn();
    usePublicGroupsMock.mockClear();
  });

  it("renders membership error state in my clubs without treating the error payload as a DOM child", () => {
    membershipState.error = { code: "permission-denied", privateDetail: "DO_NOT_RENDER_ERROR_OBJECT" };
    renderPage();
    expect(screen.getByTestId("C0-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /다시/ })).toBeInTheDocument();
    expect(screen.queryByText("DO_NOT_RENDER_ERROR_OBJECT")).not.toBeInTheDocument();
    expect(screen.queryByTestId("C0.noClub")).not.toBeInTheDocument();
  });
  it.each([false, true])("keeps request history inside my clubs and orders discovery first only without memberships (%s)", async hasClub => {
    if (hasClub) myGroups.push({ id: "club-1", name: "Member club", discipline: "bike", memberCount: 1, visibility: "public" });
    setCollectionDocs("users/test-uid/group_requests", [{ id: "request-1", groupId: "club-2", groupName: "Requested club", status: "pending", requestedAt: 123 }]);
    renderPage();
    const history = await screen.findByTestId("C0-1-3");
    const ownRegion = screen.getByTestId("C0-1");
    expect(ownRegion).toContainElement(history);
    const finder = screen.getByTestId("C0-2");
    const challenge = screen.getByTestId("C0-4");
    expect((hasClub ? ownRegion : finder).compareDocumentPosition(hasClub ? finder : ownRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(finder.compareDocumentPosition(challenge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId("C0.noClub") !== null).toBe(!hasClub);
  });
  it.each(["success", "reject", "unmount", "account"] as const)("gates code-input joining: %s", async (outcome) => {
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; }));
    setCallableResult("joinGroupByCode", { data: { groupId: "qa-group" } });
    const view = renderPage();
    fireEvent.change(screen.getByPlaceholderText("초대 코드 입력"), { target: { value: " ABCD1234 " } });
    fireEvent.click(screen.getByRole("button", { name: "가입" }));
    expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), "joinGroupByCode");
    if (outcome === "unmount") view.unmount();
    if (outcome === "account") Object.assign(auth, { currentUser: { uid: "other-uid" } });
    await act(async () => {
      if (outcome === "reject") rejectReady(new Error("app-check/token-timeout"));
      else resolveReady();
    });
    if (outcome === "success") {
      expect(mockCallableInvocations.filter((call) => call.name === "joinGroupByCode")).toEqual([{ name: "joinGroupByCode", data: { inviteCode: "ABCD1234" } }]);
      expect(await screen.findByText("group destination")).toBeInTheDocument();
    } else {
      expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), "joinGroupByCode");
      if (outcome === "reject") expect(screen.getByRole("button", { name: "가입" })).toBeEnabled();
    }
  });

  it.each([
    ["functions/not-found", "Invite unavailable", "유효하지 않거나 만료된 초대 코드입니다."],
    [undefined, "Invalid or expired invite code", "유효하지 않거나 만료된 초대 코드입니다."],
    [undefined, "Invalid invite code", "유효하지 않거나 만료된 초대 코드입니다."],
    ["functions/permission-denied", "Not authorized", "가입에 실패했습니다."],
    ["functions/permission-denied", "Invalid invite code", "가입에 실패했습니다."],
    ["functions/unauthenticated", "Invalid or expired invite code", "가입에 실패했습니다."],
    ["functions/invalid-argument", "유효한 초대 코드가 필요합니다.", "유효하지 않거나 만료된 초대 코드입니다."],
    ["functions/invalid-argument", "Invalid request payload", "가입에 실패했습니다."],
    ["functions/unauthenticated", "유효한 초대 코드가 필요합니다.", "가입에 실패했습니다."],
  ])("shows the correct code-input error for %s / %s", async (code, message, expected) => {
    setCallableImplementation("joinGroupByCode", () => { throw Object.assign(new Error(message), { code }); });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("초대 코드 입력"), { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByRole("button", { name: "가입" }));
    expect(await screen.findByText(expected!)).toBeInTheDocument();
    expect(screen.queryByText("group destination")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "가입" })).toBeEnabled();
  });

  it.each(["appCheck/initial-throttle", "appCheck/throttled"])("honors provider cooldown without sending or automatically retrying a join (%s)", async code => {
    vi.mocked(ensureAppCheckReady).mockRejectedValue(Object.assign(new Error("provider private detail"), {
      code, customData: { time: "00m:01s" },
    }));
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("초대 코드 입력"), { target: { value: "ABCD1234" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "가입" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("가입 신청을 보내지 못했습니다");
    expect(screen.queryByText("provider private detail")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "가입" })).toBeDisabled();
    expect(screen.getByPlaceholderText("초대 코드 입력")).toHaveValue("ABCD1234");
    fireEvent.click(screen.getByRole("button", { name: "가입" }));
    const callsAfterClick = vi.mocked(ensureAppCheckReady).mock.calls.length;
    await waitFor(() => expect(screen.getByRole("button", { name: "가입" })).toBeEnabled(), { timeout: 2000 });
    expect(vi.mocked(ensureAppCheckReady).mock.calls.length).toBe(callsAfterClick);
    expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), "joinGroupByCode");
  });

  it("explains failed verification without treating it as an invalid invite or sending a join", async () => {
    vi.mocked(ensureAppCheckReady).mockRejectedValue(new Error("app-check/token-timeout"));
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("초대 코드 입력"), { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByRole("button", { name: "가입" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("브라우저 보안 확인을 완료하지 못해");
    expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), "joinGroupByCode");
  });

  it("classifies SDK day durations and rejects unrelated or malformed errors without exposing provider data", () => {
    expect(appCheckFailureRecovery({ code: "appCheck/initial-throttle", customData: { time: "01d:00m:00s" } })).toEqual({ throttled: true, waitMs: 86400000 });
    expect(appCheckFailureRecovery({ code: "appCheck/throttled", message: "Attempts allowed again after 20h:58m:47s (appCheck/throttled)." })).toEqual({ throttled: true, waitMs: 75527000 });
    expect(appCheckFailureRecovery({ code: "appCheck/throttled", customData: { time: "malformed" } })).toEqual({ throttled: true, waitMs: null });
    expect(appCheckFailureRecovery({ code: "functions/permission-denied" })).toBeNull();
  });

  it("shows discovery first with its no-club guidance when no clubs are joined", () => {
    renderPage();

    const notice = screen.getByTestId("C0.noClub");
    const discovery = screen.getByRole("heading", { name: "클럽 찾기" });
    expect(discovery.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("labels invite joining and provides one create action without zero-count repetition", () => {
    renderPage();
    expect(screen.getByRole("textbox", { name: "초대 코드" })).toHaveAttribute("id", "club-invite-code");
    expect(screen.getAllByRole("button", { name: "클럽 만들기" })).toHaveLength(1);
    expect(screen.queryByTestId("C0-0-1")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "거리 리그 살펴보기" })).toHaveAttribute("href", "/ko/explore/challenges");
  });

  it("applies incoming global search to memberships and public clubs while preserving independent manual inputs", async () => {
    myGroups.push(
      { id: "ride", name: "라이딩 그룹", discipline: "bike", memberCount: 1, visibility: "public" },
      { id: "run", name: "러닝 그룹", discipline: "run", memberCount: 1, visibility: "public" },
    );
    function ExternalSearch() {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/ko/clubs?q=러")}>External club search</button>;
    }
    renderWithProviders(<><ExternalSearch /><GroupsPage /></>, { route: "/ko/clubs?q=라", authenticated: true });
    const ownInput = screen.getByRole("searchbox", { name: "내 클럽 검색" });
    const publicInput = screen.getByRole("searchbox", { name: "클럽 이름 검색" });
    expect(ownInput).toHaveValue("라");
    expect(publicInput).toHaveValue("라");
    expect(screen.getByText("라이딩 그룹")).toBeInTheDocument();
    expect(screen.queryByText("러닝 그룹")).not.toBeInTheDocument();
    expect(screen.getByText("조건에 맞는 클럽이 없어요")).toBeInTheDocument();
    expect(screen.queryByText("공개 클럽이 없습니다")).not.toBeInTheDocument();
    fireEvent.change(ownInput, { target: { value: "러" } });
    expect(publicInput).toHaveValue("라");
    expect(screen.getByText("러닝 그룹")).toBeInTheDocument();
    fireEvent.change(publicInput, { target: { value: "Other" } });
    expect(ownInput).toHaveValue("러");
    fireEvent.click(screen.getByRole("button", { name: "External club search" }));
    await waitFor(() => expect(publicInput).toHaveValue("러"));
    expect(ownInput).toHaveValue("러");
    expect(usePublicGroupsMock).toHaveBeenLastCalledWith(expect.objectContaining({ searchText: "러" }));
  });

  it("applies menu sport to memberships and discovery, scopes city to discovery, and restores URL history", async () => {
    myGroups.push(
      { id: "bike", name: "사이클 모임", discipline: "bike", memberCount: 1, visibility: "public" },
      { id: "run", name: "러닝 모임", discipline: "run", memberCount: 1, visibility: "public" },
    );
    function RouteControls() {
      const navigate = useNavigate();
      return <>
        <button onClick={() => navigate("/ko/clubs?sport=bike&city=부산")}>Menu club filters</button>
        <button onClick={() => navigate("/ko/clubs")}>Clear menu club filters</button>
        <button onClick={() => navigate(-1)}>Back</button>
      </>;
    }
    renderWithProviders(<><RouteControls /><GroupsPage /></>, {
      route: "/ko/clubs?sport=run&city=서울", authenticated: true,
    });
    expect(screen.getByText("러닝 모임")).toBeInTheDocument();
    expect(screen.queryByText("사이클 모임")).not.toBeInTheDocument();
    expect(usePublicGroupsMock).toHaveBeenLastCalledWith(expect.objectContaining({ discipline: "run", city: "서울" }));
    fireEvent.click(screen.getByRole("button", { name: "Menu club filters" }));
    expect(await screen.findByText("사이클 모임")).toBeInTheDocument();
    expect(screen.queryByText("러닝 모임")).not.toBeInTheDocument();
    expect(usePublicGroupsMock).toHaveBeenLastCalledWith(expect.objectContaining({ discipline: "bike", city: "부산" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear menu club filters" }));
    expect(await screen.findByText("러닝 모임")).toBeInTheDocument();
    expect(screen.getByText("사이클 모임")).toBeInTheDocument();
    expect(usePublicGroupsMock).toHaveBeenLastCalledWith(expect.objectContaining({ discipline: "ALL", city: "" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByText("러닝 모임")).not.toBeInTheDocument());
    expect(usePublicGroupsMock).toHaveBeenLastCalledWith(expect.objectContaining({ discipline: "bike", city: "부산" }));
  });

  it("disables the public group query before authentication", () => {
    renderPage(false);

    expect(usePublicGroupsMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("keeps an invite-code request on the group list when the server reports pending", async () => {
    setCallableResult("joinGroupByCode", { data: { groupId: "group-1", status: "pending" } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("초대 코드 입력"), { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByRole("button", { name: "가입" }));

    expect(await screen.findByText("가입 요청이 전송되었습니다")).toBeInTheDocument();
    expect(screen.getByText(/클럽장 승인 후 가입이 완료됩니다/)).toBeInTheDocument();
    expect(screen.queryByText("group destination")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "가입" })).toBeEnabled());
  }, 15_000);

  function addManualPublicGroup() {
    publicGroups.push({
      id: "group-1",
      name: "Manual Club",
      description: "",
      creatorId: "creator-1",
      createdAt: Date.now(),
      isActive: true,
      inviteCode: "CODE",
      visibility: "public",
      approval: "manual",
      memberCount: 2,
    });
  }

  it.each(["active", "pending", "reject"] as const)("ignores old-account public join %s responses and resets busy state", async outcome => {
    addManualPublicGroup();
    let resolveJoin!: (value: unknown) => void;
    let rejectJoin!: (error: Error) => void;
    setCallableImplementation("joinGroupPublic", () => new Promise((resolve, reject) => { resolveJoin = resolve; rejectJoin = reject; }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "가입 신청" }));
    await waitFor(() => expect(resolveJoin).toBeDefined());
    await act(async () => {
      Object.assign(auth, { currentUser: { uid: "other-uid" } });
      simulateLogin({ uid: "other-uid" });
    });
    expect(screen.getByRole("button", { name: "가입 신청" })).toBeEnabled();
    await act(async () => {
      if (outcome === "reject") rejectJoin(new Error("permission-denied"));
      else resolveJoin({ data: { success: true, status: outcome } });
    });
    expect(screen.queryByText("group destination")).not.toBeInTheDocument();
    expect(screen.queryByText(/Manual Club 클럽은 수동 승인 방식입니다/)).not.toBeInTheDocument();
    expect(screen.queryByText("가입에 실패했습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("가입 요청이 전송되었습니다")).not.toBeInTheDocument();
  });

  it("keeps a public join request on the list when the deployed contract reports pending", async () => {
    addManualPublicGroup();
    setCallableResult("joinGroupPublic", { data: { success: true, status: "pending" } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "가입 신청" }));

    expect(await screen.findByText(/Manual Club 클럽은 수동 승인 방식입니다/)).toBeInTheDocument();
    expect(screen.queryByText("group destination")).not.toBeInTheDocument();
  }, 15_000);

  it("does not infer pending from local approval metadata when the server reports an active join", async () => {
    addManualPublicGroup();
    setCallableResult("joinGroupPublic", { data: { success: true, status: "active" } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "가입 신청" }));

    // 가입 완료 — 알림을 띄우고 '내가 속한 클럽'으로 옮긴다. 상세로 이동하지 않는다(#1558).
    expect(await screen.findByText("Manual Club 클럽에 가입했어요.")).toBeInTheDocument();
    expect(screen.getByTestId("C0-1")).toHaveTextContent("Manual Club");
    expect(screen.queryByRole("button", { name: "가입 신청" })).not.toBeInTheDocument();
    expect(screen.queryByText("group destination")).not.toBeInTheDocument();
    expect(membershipState.retry).toHaveBeenCalled();
    expect(ensureAppCheckReady).toHaveBeenCalled();
  }, 15_000);

  it.each([false, true])("가입이 서버 목록에 반영된 뒤 탈퇴하면 복원하지 않는다 서버 선반영 %s", async (ackBeforeReply) => {
    addManualPublicGroup();
    let resolveJoin!: (value: unknown) => void;
    setCallableImplementation("joinGroupPublic", () => new Promise((resolve) => { resolveJoin = resolve; }));
    const view = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "가입 신청" }));
    await waitFor(() => expect(resolveJoin).toBeDefined());
    if (ackBeforeReply) {
      membershipState.snapshot = [...publicGroups];
      view.rerender(pageRoutes());
    }
    await act(async () => { resolveJoin({ data: { success: true, status: "active" } }); });
    await waitFor(() => expect(screen.getByTestId("C0-1")).toHaveTextContent("Manual Club"));
    if (!ackBeforeReply) {
      // 아직 서버 확인 전인 빈 목록은 가입 직후 표시를 지우지 않는다.
      membershipState.snapshot = [];
      view.rerender(pageRoutes());
      expect(screen.getByTestId("C0-1")).toHaveTextContent("Manual Club");
      membershipState.snapshot = [...publicGroups];
      view.rerender(pageRoutes());
    }
    membershipState.snapshot = [];
    view.rerender(pageRoutes());
    expect(await screen.findByRole("button", { name: "가입 신청" })).toBeEnabled();
    expect(screen.queryByTestId("C0-1")).not.toBeInTheDocument();
  });

  it("treats an already-member answer as joined instead of a silent failure", async () => {
    addManualPublicGroup();
    setCallableImplementation("joinGroupPublic", () => Promise.reject(Object.assign(new Error("Already a member"), { code: "functions/already-exists" })));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "가입 신청" }));

    expect(await screen.findByText("이미 가입한 클럽이에요.")).toBeInTheDocument();
    expect(screen.getByTestId("C0-1")).toHaveTextContent("Manual Club");
    expect(screen.queryByText("가입에 실패했습니다.")).not.toBeInTheDocument();
  }, 15_000);

  it.each(["request", "membership"])("서버가 임시 대기를 확인한 뒤 거절 또는 탈퇴하면 재가입할 수 있다 %s", async (ack) => {
    addManualPublicGroup();
    setCallableResult("joinGroupPublic", { data: { success: true, status: "pending" } });
    const view = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "가입 신청" }));
    expect(await screen.findByRole("button", { name: "승인 대기" })).toBeDisabled();
    if (ack === "request") membershipState.pending = new Set(["group-1"]);
    else membershipState.snapshot = [...publicGroups];
    view.rerender(pageRoutes());
    membershipState.pending = new Set();
    membershipState.snapshot = [];
    view.rerender(pageRoutes());
    expect(await screen.findByRole("button", { name: "가입 신청" })).toBeEnabled();
  });

  it("shows waiting-for-approval on the card for pending and already-pending answers", async () => {
    addManualPublicGroup();
    setCallableImplementation("joinGroupPublic", () => Promise.reject(Object.assign(new Error("Join request already pending"), { code: "functions/already-exists" })));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "가입 신청" }));

    expect(await screen.findByRole("button", { name: "승인 대기" })).toBeDisabled();
  }, 15_000);

  it("marks clubs with a pending request and locks join buttons while my clubs reload", () => {
    addManualPublicGroup();
    membershipState.pending = new Set(["group-1"]);
    const view = renderPage();
    expect(screen.getByRole("button", { name: "승인 대기" })).toBeDisabled();
    view.unmount();
    membershipState.pending = new Set();
    membershipState.loading = true;
    const unknown = renderPage();
    // 내 클럽을 처음 읽는 동안에는 클럽 찾기 카드를 보이지 않는다(가입한 클럽이 섞여 보이지 않게).
    expect(screen.queryByRole("button", { name: "확인 중..." })).not.toBeInTheDocument();
    expect(screen.queryByText("Manual Club")).not.toBeInTheDocument();
    unknown.unmount();
    myGroups.push({ id: "club-1", name: "Member club", discipline: "bike", memberCount: 1, visibility: "public" });
    renderPage();
    expect(screen.getByRole("button", { name: "확인 중..." })).toBeDisabled();
    // 다시 읽는 동안에도 이미 아는 내 클럽은 자리표시로 가리지 않는다.
    expect(screen.getByTestId("C0-1")).toHaveTextContent("Member club");
  });

  it("reports a failed public join as a visible toast", async () => {
    addManualPublicGroup();
    setCallableImplementation("joinGroupPublic", () => Promise.reject(Object.assign(new Error("internal"), { code: "functions/internal" })));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "가입 신청" }));

    expect(await screen.findByText("가입에 실패했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "가입 신청" })).toBeEnabled();
  }, 15_000);
});
