import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady } from "../../services/firebase";
import GroupsPage from "./GroupsPage";

const { publicGroups, usePublicGroupsMock } = vi.hoisted(() => ({
  publicGroups: [] as Array<Record<string, unknown>>,
  usePublicGroupsMock: vi.fn(),
}));

vi.mock("../../hooks/useGroup", () => ({
  useMyGroups: () => ({ groups: [], loading: false, error: null, retry: vi.fn() }),
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
    publicGroups.splice(0);
    usePublicGroupsMock.mockClear();
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

  it("shows the club discovery notice above the list when no clubs are joined", () => {
    renderPage();

    const notice = screen.getByText("아직 가입한 클럽이 없어요 — 클럽 찾기");
    const discovery = screen.getByRole("heading", { name: "그룹 찾기" });
    expect(notice.compareDocumentPosition(discovery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getByText(/그룹장 승인 후 가입이 완료됩니다/)).toBeInTheDocument();
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

  it("keeps a public join request on the list when the deployed contract reports pending", async () => {
    addManualPublicGroup();
    setCallableResult("joinGroupPublic", { data: { success: true, status: "pending" } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "가입 신청" }));

    expect(await screen.findByText(/Manual Club 그룹은 수동 승인 방식입니다/)).toBeInTheDocument();
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
