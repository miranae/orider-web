import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, setCallableImplementation, setCallableResult, setCollectionDocs, simulateLogin } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady } from "../../services/firebase";
import GroupsPage from "./GroupsPage";

const { publicGroups, myGroups, membershipState, usePublicGroupsMock } = vi.hoisted(() => ({
  membershipState: { error: null as unknown },
  myGroups: [] as Array<Record<string, unknown>>,
  publicGroups: [] as Array<Record<string, unknown>>,
  usePublicGroupsMock: vi.fn(),
}));

vi.mock("../../hooks/useGroup", () => ({
  useGroupMemberRole: () => ({ role: null, loading: false }),
  useMyGroups: () => ({ groups: myGroups, loading: false, error: membershipState.error, retry: vi.fn() }),
  usePublicGroups: (options: unknown) => {
    usePublicGroupsMock(options);
    return { groups: publicGroups, loading: false, error: null, retry: vi.fn() };
  },
}));

vi.mock("../../hooks/useGroupNextEvents", () => ({
  useGroupNextEvents: () => ({ byGroup: new Map(), loading: false }),
}));

function renderPage(authenticated = true) {
  return renderWithProviders(
    <Routes>
      <Route path="/ko/groups" element={<GroupsPage />} />
      <Route path="/ko/club/:groupId" element={<div>group destination</div>} />
    </Routes>,
    { route: "/ko/groups", authenticated },
  );
}

describe("GroupsPage join results", () => {
  beforeEach(() => {
    vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
    vi.mocked(httpsCallable).mockClear();
    mockCallableInvocations.length = 0;
    Object.assign(auth, { currentUser: { uid: "test-uid" } });
    publicGroups.splice(0); myGroups.splice(0); membershipState.error = null;
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

    expect(await screen.findByText("group destination")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  }, 15_000);
});
