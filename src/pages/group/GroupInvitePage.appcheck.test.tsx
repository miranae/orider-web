import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady } from "../../services/firebase";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../../__tests__/mocks/firebase";
import GroupInvitePage from "./GroupInvitePage";
import groupMessages from "../../i18n/resources/ko/group.json";

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
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/club/qa-group", { replace: true }));
    expect(mockCallableInvocations).toEqual([{ name: "joinGroupByCode", data: { inviteCode: "ABCD-EFGH" } }]);
  });

  it.each([
    ["functions/not-found", "Invite unavailable", "유효하지 않거나 만료된 초대 코드입니다."],
    [undefined, "Invalid or expired invite code", "유효하지 않거나 만료된 초대 코드입니다."],
    [undefined, "Invalid invite code", "유효하지 않거나 만료된 초대 코드입니다."],
    ["functions/permission-denied", "Not authorized", groupMessages["inviteLink.retryMessage"]],
    ["functions/permission-denied", "Invalid invite code", groupMessages["inviteLink.retryMessage"]],
    ["functions/unauthenticated", "Invalid or expired invite code", groupMessages["inviteLink.retryMessage"]],
    ["functions/invalid-argument", "유효한 초대 코드가 필요합니다.", "유효하지 않거나 만료된 초대 코드입니다."],
    ["functions/invalid-argument", "Invalid request payload", groupMessages["inviteLink.retryMessage"]],
    ["functions/unauthenticated", "유효한 초대 코드가 필요합니다.", groupMessages["inviteLink.retryMessage"]],
  ])("shows the correct invite-link error for %s / %s", async (code, message, expected) => {
    setCallableImplementation("joinGroupByCode", () => { throw Object.assign(new Error(message), { code }); });
    renderInvite();
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(navigate).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    const retry = screen.queryByRole("button", { name: groupMessages["inviteLink.retry"] });
    if (expected === groupMessages["inviteLink.retryMessage"]) expect(retry).toBeEnabled();
    else expect(retry).not.toBeInTheDocument();
  });

  it("shows join failure without sending a protected request when App Check cannot initialize", async () => {
    vi.mocked(ensureAppCheckReady).mockRejectedValue(new Error("app-check/token-timeout"));
    renderInvite();
    expect(await screen.findByRole("alert")).toHaveTextContent(groupMessages["inviteLink.retryMessage"]);
    expect(navigate).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(httpsCallable).not.toHaveBeenCalled();
    vi.mocked(ensureAppCheckReady).mockResolvedValue(undefined);
    setCallableResult("joinGroupByCode", { data: { groupId: "qa-recovered" } });
    fireEvent.click(screen.getByRole("button", { name: groupMessages["inviteLink.retry"] }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/club/qa-recovered", { replace: true }));
    expect(mockCallableInvocations).toEqual([{ name: "joinGroupByCode", data: { inviteCode: "ABCD-EFGH" } }]);
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
    expect(navigate).toHaveBeenCalledWith("/club/qa-new-group", { replace: true });
  });

});
