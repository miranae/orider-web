import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FriendInvitePage from "./FriendInvitePage";
const m = vi.hoisted(() => ({ user: null as null | { uid: string; isAnonymous: boolean }, resolve: vi.fn(), add: vi.fn(), navigate: vi.fn(), toast: vi.fn(), signIn: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, values?: { nickname?: string }) => key === "invite.titleWithName" ? values?.nickname : key }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: m.user, loading: false, signIn: m.signIn }) }));
vi.mock("../hooks/useFriends", () => ({ useFriends: () => ({ addByCode: m.add, actionLoading: false }) }));
vi.mock("../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => m.navigate }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: m.toast }) }));
vi.mock("../services/friendInvitePreview", () => ({ resolveFriendInvitePreview: m.resolve }));
vi.mock("../services/activityDiscovery", () => ({ loadActivityDiscovery: async () => ({ items: [] }) }));
const profile = { userId: "inviter", nickname: "가상 초대자", photoURL: null };
const view = () => <MemoryRouter initialEntries={["/friend/ABC123"]}><Routes><Route path="/friend/:code" element={<FriendInvitePage />} /></Routes></MemoryRouter>;
beforeEach(() => { vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); vi.clearAllMocks(); m.user = null; m.resolve.mockResolvedValue(profile); });
it("shows anonymous preview without automatically adding a friend", async () => {
  m.user = { uid: "anon", isAnonymous: true }; render(view());
  await screen.findByText(/가상 초대자/); expect(m.add).not.toHaveBeenCalled();
});
it("removes revoked preview on focus refresh", async () => {
  render(view()); await screen.findByText(/가상 초대자/);
  m.resolve.mockResolvedValue(null); act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(screen.queryByText(/가상 초대자/)).not.toBeInTheDocument());
});
it("does not restore old preview after same-UID SDK identity replacement", async () => {
  let finish!: (value: unknown) => void; m.user = { uid: "anon", isAnonymous: true };
  m.resolve.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const page = render(view()); m.user = { uid: "anon", isAnonymous: true }; m.resolve.mockResolvedValue(null); page.rerender(view());
  await act(async () => { finish(profile); }); expect(screen.queryByText(/가상 초대자/)).not.toBeInTheDocument();
});
it("preserves the existing signed-in add action", async () => {
  m.user = { uid: "viewer", isAnonymous: false }; m.add.mockResolvedValue({ success: true, friendNickname: "가상 초대자" });
  render(view()); await waitFor(() => expect(m.add).toHaveBeenCalledWith("ABC123", "invite_link"));
  expect(m.resolve).not.toHaveBeenCalled(); expect(m.navigate).toHaveBeenCalledWith("/athlete/me/friends", { replace: true });
});
