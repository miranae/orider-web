import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCallableResult } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
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
      <Route path="/ko/group/:groupId" element={<div>group destination</div>} />
    </Routes>,
    { route: "/ko/groups", authenticated },
  );
}

describe("GroupsPage join results", () => {
  beforeEach(() => {
    publicGroups.splice(0);
    usePublicGroupsMock.mockClear();
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
