import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady } from "../../services/firebase";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../../__tests__/mocks/firebase";
import GroupMembersPage from "./GroupMembersPage";
const state = vi.hoisted(() => ({ uid: "qa-rider", navigate: vi.fn(), showToast: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: state.uid } }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: state.showToast }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true) }) }));
vi.mock("../../hooks/useLocalizedNavigate", async (importOriginal) => ({ ...await importOriginal<typeof import("../../hooks/useLocalizedNavigate")>(), useLocalizedNavigate: () => state.navigate }));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "group-1", creatorId: "qa-owner", name: "QA group", description: "", visibility: "private" }, loading: false }),
  useGroupMemberRole: () => ({ role: "member", loading: false }),
  useGroupMembers: () => ({ members: [{ id: state.uid, status: "active", role: "member" }], loading: false }),
}));
vi.mock("../../hooks/useGroupInviteCode", () => ({ useGroupInviteCode: () => ({ code: null, loading: false }) }));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({ memberStats: {} }) }));
vi.mock("../../components/group/GroupSubNav", () => ({ default: () => null }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
function Page() { return <MemoryRouter initialEntries={["/group/group-1/settings"]}><Link to="/group/group-2/settings">Another group</Link><Routes><Route path="/group/:groupId/settings" element={<GroupMembersPage />} /></Routes></MemoryRouter>; }
function renderPage() { const view = render(<Page />); fireEvent.click(screen.getByLabelText("클럽 메뉴")); return view; }
beforeEach(() => {
  state.uid = "qa-rider"; state.navigate.mockReset(); state.showToast.mockReset();
  Object.assign(auth, { currentUser: { uid: "qa-rider" } });
  vi.mocked(httpsCallable).mockClear();
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  mockCallableInvocations.length = 0;
  setCallableResult("leaveGroup", { data: { success: true } });
});
describe("normal group leave App Check readiness", () => {
  it("waits, keeps duplicate taps disabled, then invokes the exact group once", async () => {
    let ready!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    renderPage(); fireEvent.click(screen.getByRole("button", { name: "그룹 탈퇴" }));
    expect(httpsCallable).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "그룹 탈퇴" })).toBeDisabled());
    await act(async () => ready());
    expect(mockCallableInvocations).toEqual([{ name: "leaveGroup", data: { groupId: "group-1" } }]);
    expect(state.showToast).toHaveBeenCalledWith("그룹에서 탈퇴했습니다.");
    expect(state.navigate).toHaveBeenCalledWith("/clubs");
  });
  it("fails closed on readiness rejection with localized failure", async () => {
    vi.mocked(ensureAppCheckReady).mockRejectedValue(new Error("app-check/token-timeout"));
    renderPage(); fireEvent.click(screen.getByRole("button", { name: "그룹 탈퇴" }));
    await waitFor(() => expect(state.showToast).toHaveBeenCalledWith("탈퇴에 실패했습니다.", "error"));
    expect(httpsCallable).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "그룹 탈퇴" })).toBeEnabled();
  });
  it.each(["live-auth", "account-context", "route-change", "unmount"])("cancels a pending leave after %s", async (change) => {
    let ready!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    const view = renderPage(); fireEvent.click(screen.getByRole("button", { name: "그룹 탈퇴" }));
    if (change === "live-auth") Object.assign(auth, { currentUser: { uid: "other" } });
    if (change === "account-context") { state.uid = "other"; view.rerender(<Page />); }
    if (change === "route-change") fireEvent.click(screen.getByRole("link", { name: "Another group" }));
    if (change === "unmount") view.unmount();
    await act(async () => ready());
    expect(httpsCallable).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled(); expect(state.showToast).not.toHaveBeenCalled();
  });
  it("does not navigate or notify a new account after a dispatched leave resolves", async () => {
    let done!: () => void;
    setCallableImplementation("leaveGroup", () => new Promise<void>((resolve) => { done = resolve; }));
    const view = renderPage(); fireEvent.click(screen.getByRole("button", { name: "그룹 탈퇴" }));
    await waitFor(() => expect(mockCallableInvocations).toHaveLength(1));
    state.uid = "other"; Object.assign(auth, { currentUser: { uid: "other" } }); view.rerender(<Page />);
    await act(async () => done());
    expect(state.navigate).not.toHaveBeenCalled(); expect(state.showToast).not.toHaveBeenCalled();
  });
});
