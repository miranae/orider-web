import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  loading: false, params: new URLSearchParams(), complete: vi.fn(), signIn: vi.fn(),
  navigate: vi.fn(), toast: vi.fn(), track: vi.fn(), consumeState: vi.fn(),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("react-router-dom", () => ({ useSearchParams: () => [mocks.params] }));
vi.mock("../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => mocks.navigate }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ loading: mocks.loading }) }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: mocks.signIn }));
vi.mock("../services/firebase", () => ({ auth: { name: "auth" } }));
vi.mock("../services/socialAuth", () => ({ completeSocialAuth: mocks.complete, consumeSocialAuthState: mocks.consumeState }));
vi.mock("../services/analytics", () => ({ track: mocks.track }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
import SocialAuthCallbackPage, { socialAuthErrorKey } from "./SocialAuthCallbackPage";

describe("socialAuthErrorKey", () => {
  it("maps server error codes to localized keys", () => {
    expect(socialAuthErrorKey("functions/already-exists")).toBe("socialCallback.error.alreadyLinked");
    expect(socialAuthErrorKey("functions/failed-precondition")).toBe("socialCallback.error.providerInUse");
    expect(socialAuthErrorKey("functions/not-found")).toBe("socialCallback.error.expired");
    expect(socialAuthErrorKey("functions/deadline-exceeded")).toBe("socialCallback.error.expired");
    expect(socialAuthErrorKey("functions/permission-denied")).toBe("socialCallback.error.denied");
    expect(socialAuthErrorKey(undefined)).toBe("socialCallback.error.generic");
  });
});

describe("SocialAuthCallbackPage", () => {
  beforeEach(() => {
    mocks.loading = false;
    mocks.params = new URLSearchParams("code=provider-code&state=opaque-state");
    mocks.complete.mockReset();
    mocks.consumeState.mockReset().mockReturnValue(true);
    mocks.signIn.mockReset().mockResolvedValue(undefined);
    mocks.navigate.mockReset();
    mocks.toast.mockReset();
    mocks.track.mockReset();
  });

  it("removes callback credentials immediately while auth is still restoring", () => {
    mocks.loading = true;
    window.history.replaceState(null, "", "/auth/social/callback?code=provider-code&state=opaque-state");
    render(<SocialAuthCallbackPage />);
    expect(window.location.search).toBe("");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("waits for the restored session and exchanges only once in StrictMode", async () => {
    mocks.loading = true;
    mocks.complete.mockResolvedValue({ mode: "login", provider: "naver", token: "custom-token", isNewUser: true, returnTo: "/activity/a?tab=analysis#laps" });
    const { rerender } = render(<StrictMode><SocialAuthCallbackPage /></StrictMode>);
    expect(mocks.complete).not.toHaveBeenCalled();
    mocks.loading = false;
    rerender(<StrictMode><SocialAuthCallbackPage /></StrictMode>);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/activity/a?tab=analysis#laps", { replace: true }));
    expect(mocks.consumeState).toHaveBeenCalledExactlyOnceWith("opaque-state");
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith("provider-code", "opaque-state");
    expect(mocks.signIn).toHaveBeenCalledWith({ name: "auth" }, "custom-token");
    expect(mocks.track).toHaveBeenCalledWith("sign_up", { method: "naver" });
  });

  it("returns an existing account to settings after linking without replacing its session", async () => {
    mocks.complete.mockResolvedValue({ mode: "link", provider: "kakao", returnTo: "/settings/account" });
    render(<SocialAuthCallbackPage />);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/settings/account", { replace: true }));
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith("socialCallback.linked", "success");
  });

  it.each(["error=access_denied&state=s", "state=s"])("does not exchange cancelled or incomplete responses: %s", async (query) => {
    mocks.params = new URLSearchParams(query);
    render(<SocialAuthCallbackPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(query.startsWith("error=") ? "socialCallback.error.cancelled" : "socialCallback.error.generic");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("rejects an unsolicited callback before exchanging the code", async () => {
    mocks.consumeState.mockReturnValue(false);
    render(<SocialAuthCallbackPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("socialCallback.error.denied");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("keeps a failed custom-token sign-in on the error screen", async () => {
    mocks.complete.mockResolvedValue({ mode: "login", provider: "kakao", token: "custom-token", isNewUser: false, returnTo: "/" });
    mocks.signIn.mockRejectedValue({ code: "auth/invalid-custom-token" });
    render(<SocialAuthCallbackPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("socialCallback.error.generic");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
