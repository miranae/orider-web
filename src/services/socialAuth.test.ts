const mocks = vi.hoisted(() => ({ ready: vi.fn(), callable: vi.fn(), invoke: vi.fn() }));
vi.mock("./firebase", () => ({ functions: {}, ensureAppCheckReady: mocks.ready }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
vi.mock("./errorLogger", () => ({ logClientError: vi.fn() }));
import { completeSocialAuth, consumeSocialAuthState, currentReturnTo, listSocialLinks, socialRedirectUri, startSocialAuth, unlinkSocial, SOCIAL_CALLBACK_PATH } from "./socialAuth";

describe("socialAuth helpers", () => {
  afterEach(() => { window.history.replaceState(null, "", "/"); });

  it("strips the language prefix so the callback can re-apply the current language", () => {
    window.history.replaceState(null, "", "/ko/activity/abc?tab=analysis#laps");
    expect(currentReturnTo()).toBe("/activity/abc?tab=analysis#laps");
    window.history.replaceState(null, "", "/en");
    expect(currentReturnTo()).toBe("/");
    window.history.replaceState(null, "", "/korea-ride");
    expect(currentReturnTo()).toBe("/korea-ride");
  });

  it("uses a language-free callback path on the current origin", () => {
    expect(socialRedirectUri()).toBe(`${window.location.origin}${SOCIAL_CALLBACK_PATH}`);
    expect(SOCIAL_CALLBACK_PATH).toBe("/auth/social/callback");
  });
});

describe("socialAuth callable readiness", () => {
  beforeEach(() => {
    mocks.ready.mockReset().mockResolvedValue(undefined);
    mocks.callable.mockReset().mockReturnValue(mocks.invoke);
    mocks.invoke.mockReset();
  });

  it.each([
    ["complete", () => completeSocialAuth("code", "state"), "socialAuthComplete", { code: "code", state: "state" }, { mode: "link", provider: "naver", returnTo: "/settings/account" }],
    ["list", () => listSocialLinks(), "socialAuthListLinks", undefined, { links: [] }],
    ["unlink", () => unlinkSocial("kakao"), "socialAuthUnlink", { provider: "kakao" }, { unlinked: true }],
  ] as const)("waits for App Check before %s", async (_label, invoke, name, payload, data) => {
    let ready!: () => void;
    mocks.ready.mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    mocks.invoke.mockResolvedValue({ data });
    const result = invoke();
    expect(mocks.callable).not.toHaveBeenCalled();
    ready();
    await result;
    expect(mocks.callable).toHaveBeenCalledWith({}, name);
    if (payload === undefined) expect(mocks.invoke).toHaveBeenCalledWith();
    else expect(mocks.invoke).toHaveBeenCalledWith(payload);
  });

  it("does not start OAuth when App Check fails", async () => {
    const error = new Error("app-check/token-timeout");
    mocks.ready.mockRejectedValue(error);
    await expect(startSocialAuth("naver", "login")).rejects.toBe(error);
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});

describe("OAuth browser state binding", () => {
  const stateKey = "orider.social-auth.state.v1";
  afterEach(() => {
    sessionStorage.removeItem(stateKey);
    vi.unstubAllGlobals();
  });

  it("saves the server-issued state in this tab before leaving for the provider", async () => {
    const assign = vi.fn(() => expect(sessionStorage.getItem(stateKey)).toBe("expected-state"));
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173", assign } });
    mocks.ready.mockResolvedValue(undefined);
    mocks.callable.mockReturnValue(mocks.invoke);
    mocks.invoke.mockResolvedValue({ data: { authorizeUrl: "https://nid.naver.com/oauth2.0/authorize?state=expected-state" } });
    await startSocialAuth("naver", "login", "/settings/account");
    expect(assign).toHaveBeenCalledOnce();
    expect(consumeSocialAuthState("expected-state")).toBe(true);
    expect(consumeSocialAuthState("expected-state")).toBe(false);
  });

  it("rejects unsolicited, missing, or another tab's state without consuming the valid request", () => {
    expect(consumeSocialAuthState("other-tab-state")).toBe(false);
    sessionStorage.setItem(stateKey, "expected-state");
    expect(consumeSocialAuthState(null)).toBe(false);
    expect(consumeSocialAuthState("attacker-state")).toBe(false);
    expect(sessionStorage.getItem(stateKey)).toBe("expected-state");
    expect(consumeSocialAuthState("expected-state")).toBe(true);
  });

  it("does not navigate if the provider URL omits state", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173", assign } });
    mocks.invoke.mockResolvedValue({ data: { authorizeUrl: "https://kauth.kakao.com/oauth/authorize" } });
    await expect(startSocialAuth("kakao", "login", "/")).rejects.toThrow("social-auth/missing-state");
    expect(assign).not.toHaveBeenCalled();
  });
});
