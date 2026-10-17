import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDocs } from "firebase/firestore";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupMembersPage from "./GroupMembersPage";
const state = vi.hoisted(() => ({ role: "member", status: "active", invite: vi.fn(), codeStatus: "ready", retry: vi.fn() }));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "club", name: "Club", creatorId: "owner", memberCount: 1 }, loading: false }),
  useGroupMembers: () => ({ members: [{ id: "test-uid", role: state.role, status: state.status, joinedAt: 1, profile: { nickname: "Me" } }], loading: false }),
}));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({ memberStats: {} }) }));
vi.mock("../../hooks/useGroupInviteCode", () => ({ useGroupInviteCode: (...args: unknown[]) => { state.invite(...args); return { code: state.codeStatus === "ready" ? "ABCD-EFGH" : "", status: state.codeStatus, retry: state.retry }; } }));
beforeEach(() => { state.role = "member"; state.status = "active"; state.codeStatus="ready"; state.retry.mockClear(); state.invite.mockClear(); vi.mocked(getDocs).mockClear(); });
function showPage() {
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/members" element={<GroupMembersPage />} /></Routes>, { route: "/ko/club/club/members", authenticated: true });
}
describe("club invitation read permissions", () => {
  it("does not request an invite code or expose the invitation panel to an ordinary member", () => {
    showPage();
    expect(state.invite).toHaveBeenCalledWith(undefined, undefined);
    expect(screen.queryByTestId("C7-3")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab",{name:/대기중/})).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "초대" })).not.toBeInTheDocument();
  });
  it("allows active co-leaders to read the invitation list through the manager rules", async () => {
    state.role = "co-leader";
    showPage();
    expect(state.invite).toHaveBeenCalledWith("club", "test-uid");
    expect(screen.queryByTestId("C7-3")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab",{name:/대기중/})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "초대" }));
    await waitFor(() => expect(getDocs).toHaveBeenCalledWith(expect.objectContaining({ path: "groups/club/invitations" })));
  });
  it("shows one invite-load error instead of an empty URL, copy action, and duplicate failures", async () => {
    state.role="co-leader";state.codeStatus="failed";
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("offline"));
    showPage();await userEvent.click(screen.getByRole("tab",{name:"초대"}));
    await waitFor(()=>expect(screen.getAllByRole("alert")).toHaveLength(1));
    expect(screen.getByText("초대 링크를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByTestId("C6-3-1")).not.toBeInTheDocument();
    expect(screen.queryByText("초대 코드를 불러오지 못했습니다.")).not.toBeInTheDocument();
    expect(screen.getByTestId("C6-3-regenerate")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button",{name:"다시 시도"}));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });
  it("does not grant invitation reads to inactive co-leaders", () => {
    state.role = "co-leader"; state.status = "inactive";
    showPage();
    expect(state.invite).toHaveBeenCalledWith(undefined, undefined);
    expect(screen.queryByRole("tab", { name: "초대" })).not.toBeInTheDocument();
  });
});
