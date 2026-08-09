import { beforeEach, describe, expect, it, vi } from "vitest";

import { scrubUrlCredentials } from "./sentry";

const signInWithCustomToken = vi.fn();
const signOut = vi.fn();

vi.mock("firebase/auth", () => ({
  signInWithCustomToken: (...args: unknown[]) => signInWithCustomToken(...args),
  signOut: (...args: unknown[]) => signOut(...args),
}));

const logClientError = vi.fn();
vi.mock("./errorLogger", () => ({
  logClientError: (...args: unknown[]) => logClientError(...args),
}));

const {
  applyImpersonationTokenFromUrl,
  clearImpersonationState,
  hasImpersonationTokenInUrl,
  readImpersonationState,
} = await import("./impersonation");

function setUrl(search: string) {
  window.history.replaceState({}, "", `/ko/${search}`);
}

function credential(claims: Record<string, unknown>, uid = "target-uid") {
  return { user: { uid, getIdTokenResult: async () => ({ claims }) } };
}

describe("impersonation token consumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearImpersonationState();
    setUrl("");
  });

  it("does nothing without a token in the url", async () => {
    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(hasImpersonationTokenInUrl()).toBe(false);
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(readImpersonationState()).toBeNull();
  });

  it("signs in with the token and records who issued the session", async () => {
    setUrl("?impersonateToken=tok-123");
    signInWithCustomToken.mockResolvedValue(
      credential({ impersonated: true, impersonatedBy: "moon" }),
    );

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), "tok-123");
    expect(readImpersonationState()).toMatchObject({ by: "moon", targetUid: "target-uid" });
  });

  it("strips the token from the url so it cannot leak via address bar or referer", async () => {
    setUrl("?impersonateToken=tok-123&sport=run");
    signInWithCustomToken.mockResolvedValue(credential({ impersonated: true }));

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(window.location.search).toBe("?sport=run");
    expect(hasImpersonationTokenInUrl()).toBe(false);
  });

  it("signs out an existing session before switching", async () => {
    setUrl("?impersonateToken=tok-123");
    signInWithCustomToken.mockResolvedValue(credential({ impersonated: true }));

    await applyImpersonationTokenFromUrl({ currentUser: { uid: "someone" } } as never);

    expect(signOut).toHaveBeenCalled();
  });

  it("logs a failed sign-in instead of silently doing nothing", async () => {
    setUrl("?impersonateToken=expired");
    signInWithCustomToken.mockRejectedValue(new Error("auth/invalid-custom-token"));

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(logClientError).toHaveBeenCalledWith(
      "Impersonation.signInWithCustomToken",
      expect.any(Error),
      expect.objectContaining({ hasToken: true }),
    );
    // 실패해도 토큰은 URL 에서 지운다 — 새로고침 때 만료 토큰을 다시 태우지 않는다.
    expect(hasImpersonationTokenInUrl()).toBe(false);
    expect(readImpersonationState()).toBeNull();
  });

  it("does not record state when the token carries no impersonation claim", async () => {
    setUrl("?impersonateToken=plain");
    signInWithCustomToken.mockResolvedValue(credential({}));

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(readImpersonationState()).toBeNull();
  });
});

describe("scrubUrlCredentials", () => {
  it("redacts impersonation and handoff credentials from urls", () => {
    expect(scrubUrlCredentials("https://orider.co.kr/ko/?impersonateToken=abc.def&sport=run"))
      .toBe("https://orider.co.kr/ko/?impersonateToken=[redacted]&sport=run");
    expect(scrubUrlCredentials("https://orider.co.kr/?handoff=xyz"))
      .toBe("https://orider.co.kr/?handoff=[redacted]");
  });

  it("leaves ordinary urls untouched", () => {
    expect(scrubUrlCredentials("https://orider.co.kr/activity/orider_1?tab=analysis"))
      .toBe("https://orider.co.kr/activity/orider_1?tab=analysis");
  });
});
