import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady } from "../../services/firebase";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../../__tests__/mocks/firebase";
import GroupInvitePage from "./GroupInvitePage";

const { navigate, showToast } = vi.hoisted(() => ({ navigate: vi.fn(), showToast: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "qa-rider" }, loading: false }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => navigate }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));

function renderInvite() {
  return render(<MemoryRouter initialEntries={["/ko/group/join/abcd-efgh"]}>
    <Link to="/ko/group/join/wxyz-2345">another invite</Link>
    <Routes><Route path="/ko/group/join/:code" element={<GroupInvitePage />} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  vi.mocked(httpsCallable).mockClear();
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  mockCallableInvocations.length = 0;
  Object.assign(auth, { currentUser: { uid: "qa-rider" } });
  navigate.mockClear(); showToast.mockClear();
});

describe("group invite join App Check readiness", () => {
  it("waits before joining and passes the normalized invite to the protected callable", async () => {
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { resolveReady = resolve; }));
    setCallableResult("joinGroupByCode", { data: { groupId: "qa-group" } });
    renderInvite();
    expect(ensureAppCheckReady).toHaveBeenCalledOnce();
    expect(httpsCallable).not.toHaveBeenCalled();
    resolveReady();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/group/qa-group", { replace: true }));
    expect(mockCallableInvocations).toEqual([{ name: "joinGroupByCode", data: { inviteCode: "ABCD-EFGH" } }]);
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
  ])("shows the correct invite-link error for %s / %s", async (code, message, expected) => {
    setCallableImplementation("joinGroupByCode", () => { throw Object.assign(new Error(message), { code }); });
    renderInvite();
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expected, "error"));
    expect(navigate).toHaveBeenCalledWith("/groups", { replace: true });
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("/group/qa"), expect.anything());
  });

  it("shows join failure without sending a protected request when App Check cannot initialize", async () => {
    vi.mocked(ensureAppCheckReady).mockRejectedValue(new Error("app-check/token-timeout"));
    renderInvite();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/groups", { replace: true }));
    expect(showToast).toHaveBeenCalledWith(expect.any(String), "error");
    expect(httpsCallable).not.toHaveBeenCalled();
  });
  it.each(["unmount", "account-switch"] as const)("does not join an old intent after %s while readiness is pending", async (change) => {
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { resolveReady = resolve; }));
    const view = renderInvite();
    if (change === "unmount") view.unmount();
    else Object.assign(auth, { currentUser: { uid: "other-account" } });
    await act(async () => { resolveReady(); });
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("dispatches only the current route invite when readiness resolves after navigation", async () => {
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { resolveReady = resolve; }));
    setCallableResult("joinGroupByCode", { data: { groupId: "qa-new-group" } });
    renderInvite();
    fireEvent.click(screen.getByRole("link", { name: "another invite" }));
    await act(async () => { resolveReady(); });
    expect(mockCallableInvocations).toEqual([{ name: "joinGroupByCode", data: { inviteCode: "WXYZ-2345" } }]);
    expect(navigate).toHaveBeenCalledWith("/group/qa-new-group", { replace: true });
  });

});
