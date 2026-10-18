import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  list: vi.fn(), unlink: vi.fn(), start: vi.fn(), confirm: vi.fn(), showToast: vi.fn(),
  user: { uid: "u1", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: mocks.confirm }) }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../../services/socialAuth", () => ({
  SOCIAL_PROVIDERS: ["naver", "kakao"],
  listSocialLinks: mocks.list, unlinkSocial: mocks.unlink, startSocialAuth: mocks.start,
}));
import { SocialLinksCard } from "./SocialLinksCard";

describe("SocialLinksCard", () => {
  beforeEach(() => {
    mocks.user = { uid: "u1", isAnonymous: false };
    mocks.list.mockReset().mockResolvedValue([{ provider: "naver", linkedAt: 1 }]);
    mocks.unlink.mockReset().mockResolvedValue(true);
    mocks.start.mockReset().mockResolvedValue(undefined);
    mocks.confirm.mockReset().mockResolvedValue(true);
    mocks.showToast.mockReset();
  });

  it("shows linked state and starts linking for unlinked providers", async () => {
    render(<SocialLinksCard />);
    expect(await screen.findByText("pane.account.socialLinked")).toBeInTheDocument();
    const linkBtn = screen.getByRole("button", { name: "pane.account.socialLinkBtn" });
    await waitFor(() => expect(linkBtn).not.toBeDisabled());
    fireEvent.click(linkBtn);
    expect(mocks.start).toHaveBeenCalledWith("kakao", "link", "/settings/account");
  });

  it("explains when the last sign-in method cannot be unlinked", async () => {
    mocks.unlink.mockRejectedValue({ code: "functions/failed-precondition" });
    render(<SocialLinksCard />);
    fireEvent.click(await screen.findByRole("button", { name: "pane.account.socialUnlinkBtn" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("pane.account.socialUnlinkLast", "error"));
  });

  it("discards old-account results after the signed-in owner changes", async () => {
    let finishOld!: (links: Array<{ provider: string; linkedAt: number }>) => void;
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    const { rerender } = render(<SocialLinksCard />);
    mocks.user = { uid: "u2", isAnonymous: false };
    mocks.list.mockResolvedValue([]);
    rerender(<SocialLinksCard />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "pane.account.socialLinkBtn" })[0]).not.toBeDisabled());
    finishOld([{ provider: "naver", linkedAt: 1 }]);
    await waitFor(() => expect(screen.queryByText("pane.account.socialLinked")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "pane.account.socialUnlinkBtn" })).not.toBeInTheDocument();
  });

  it("renders nothing for anonymous users and does not call the server", () => {
    mocks.user = { uid: "anon", isAnonymous: true };
    const { container } = render(<SocialLinksCard />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
