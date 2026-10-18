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

  it.each(["/auth/social/callback", "/ko/auth/social/callback?retry=1#again", "/en/auth/social/callback", "/en/auth/social/callback/?retry=1", "/ko/auth/social/%63allback"])("does not return a login retry to its callback: %s", path => {
    window.history.replaceState(null, "", path);
    expect(currentReturnTo()).toBe("/");
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

  it.each(["login", "link", "reauth"] as const)("replaces explicit callback destinations before starting %s", async mode => {
    vi.stubGlobal("window", { location: { origin: "https://orider-dev.web.app", assign: vi.fn() } });
    mocks.invoke.mockResolvedValue({ data: { authorizeUrl: "https://www.strava.com/oauth/authorize", state: "expected-state" } });
    await startSocialAuth("strava", mode, "/en/auth/social/callback?retry=1#again");
    expect(mocks.invoke).toHaveBeenLastCalledWith(expect.objectContaining({ mode, returnTo: "/" }));
  });

  it.each(["link", "reauth"] as const)("preserves explicit account destinations for %s", async mode => {
    vi.stubGlobal("window", { location: { origin: "https://orider-dev.web.app", assign: vi.fn() } });
    mocks.invoke.mockResolvedValue({ data: { authorizeUrl: "https://www.strava.com/oauth/authorize", state: "expected-state" } });
    await startSocialAuth("strava", mode, "/settings/account?tab=login#strava");
    expect(mocks.invoke).toHaveBeenLastCalledWith(expect.objectContaining({ mode, returnTo: "/settings/account?tab=login#strava" }));
  });

  it("stores the canonical state instead of the Strava proxy transport envelope", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://orider.co.kr", assign } });
    mocks.invoke.mockResolvedValue({ data: { authorizeUrl: "https://www.strava.com/oauth/authorize?state=https%3A%2F%2Forider.co.kr%7Ccanonical-state&scope=read", state: "canonical-state" } });
    await startSocialAuth("strava", "login", "/");
    expect(consumeSocialAuthState("https://orider.co.kr|canonical-state")).toBe(false);
    expect(consumeSocialAuthState("canonical-state")).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith({ provider: "strava", mode: "login", redirectUri: "https://orider.co.kr/auth/social/callback", returnTo: "/" });
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
