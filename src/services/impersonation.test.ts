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
  readImpersonation,
  readImpersonationState,
  stashImpersonationToken,
  takeImpersonationFailure,
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

  // 배너 없는 위임 세션이 최악 — 위임임을 확정 못한 로그인은 세션째 끊는다.
  it("signs the session out when the token has no impersonation claim", async () => {
    setUrl("?impersonateToken=plain");
    signInWithCustomToken.mockResolvedValue(credential({}));

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(signOut).toHaveBeenCalled();
    expect(logClientError).toHaveBeenCalledWith(
      "Impersonation.missingClaim",
      expect.any(Error),
      expect.anything(),
    );
  });

  it("signs the session out when claims cannot be read", async () => {
    setUrl("?impersonateToken=tok-123");
    signInWithCustomToken.mockResolvedValue({
      user: { uid: "target-uid", getIdTokenResult: async () => { throw new Error("network"); } },
    });

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(signOut).toHaveBeenCalled();
    expect(readImpersonationState()).toBeNull();
    expect(logClientError).toHaveBeenCalledWith(
      "Impersonation.getIdTokenResult",
      expect.any(Error),
      expect.anything(),
    );
  });

  // 전환 로그아웃이 실패했는데 계속 진행하면, 토큰 로그인까지 실패했을 때 기존
  // (관리자) 세션이 남은 채 마운트돼 위임된 줄 알고 자기 계정을 만지게 된다.
  it("aborts when the pre-switch sign-out fails", async () => {
    setUrl("?impersonateToken=tok-123");
    signOut.mockRejectedValueOnce(new Error("auth/network-request-failed"));
    await applyImpersonationTokenFromUrl({ currentUser: { uid: "someone" } } as never);

    expect(signInWithCustomToken).not.toHaveBeenCalled();
    // 마운트 전이라 토스트 컨텍스트가 없다 — handoff 와 같이 플래그로 넘겨 App 이 노출한다.
    expect(takeImpersonationFailure()).toContain("위임 로그인을 중단");
    expect(takeImpersonationFailure()).toBeNull();
    expect(logClientError).toHaveBeenCalledWith(
      "Impersonation.signOutBeforeSwitch",
      expect.any(Error),
      expect.objectContaining({ hadUser: true }),
    );
  });

  // 정리 로그아웃까지 실패하면 인증된 세션이 남는다 — 배너가 뜨도록 상태를 남긴다.
  it("keeps the banner visible when the cleanup sign-out also fails", async () => {
    setUrl("?impersonateToken=plain");
    signInWithCustomToken.mockResolvedValue(credential({}));
    signOut.mockRejectedValue(new Error("auth/network-request-failed"));

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);
    signOut.mockReset();

    expect(readImpersonationState()).toMatchObject({ by: "확인 불가", targetUid: "target-uid" });
    expect(takeImpersonationFailure()).toContain("즉시 로그아웃");
  });

  // 스토리지 쓰기까지 막힌 환경 — 메모리 fallback 으로라도 배너를 띄운다.
  it("falls back to memory when the banner state cannot be stored at all", async () => {
    setUrl("?impersonateToken=tok-123");
    signInWithCustomToken.mockResolvedValue(credential({ impersonated: true }));
    signOut.mockRejectedValue(new Error("auth/network-request-failed"));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      await applyImpersonationTokenFromUrl({ currentUser: null } as never);
    } finally {
      setItem.mockRestore();
      signOut.mockReset();
    }

    expect(readImpersonation()).toEqual({
      status: "active",
      state: expect.objectContaining({ by: "확인 불가", targetUid: "target-uid" }),
    });
    clearImpersonationState();
  });

  it("tells the admin why an expired impersonation link did nothing", async () => {
    setUrl("?impersonateToken=expired");
    signInWithCustomToken.mockRejectedValue(new Error("auth/invalid-custom-token"));

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(takeImpersonationFailure()).toContain("위임 로그인에 실패");
  });

  it("logs a failed state removal instead of leaving it silent", () => {
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    try {
      clearImpersonationState();
    } finally {
      removeItem.mockRestore();
    }

    expect(logClientError).toHaveBeenCalledWith("Impersonation.clearFailed", expect.any(Error), {});
  });

  it("reports corrupt stored state instead of hiding the session", () => {
    window.localStorage.setItem("orider:impersonation", "{not-json");

    expect(readImpersonation()).toEqual({ status: "corrupt" });
    expect(readImpersonationState()).toBeNull();
    expect(logClientError).toHaveBeenCalledWith(
      "Impersonation.readCorrupt",
      expect.any(Error),
      expect.objectContaining({ rawLength: expect.any(Number) }),
    );
  });

  it("treats an object issuer as corrupt instead of crashing the banner", () => {
    window.localStorage.setItem(
      "orider:impersonation",
      JSON.stringify({ targetUid: "target-uid", by: {}, at: 1 }),
    );

    expect(readImpersonation()).toEqual({ status: "corrupt" });
  });

  it("reports an empty impersonation link instead of doing nothing", async () => {
    setUrl("?impersonateToken=");

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(takeImpersonationFailure()).toContain("토큰이 없습니다");
    expect(logClientError).toHaveBeenCalledWith(
      "Impersonation.emptyToken",
      expect.any(Error),
      {},
    );
  });

  it("treats state without a target uid as corrupt", () => {
    window.localStorage.setItem("orider:impersonation", JSON.stringify({ by: "moon", at: 1 }));

    expect(readImpersonation()).toEqual({ status: "corrupt" });
  });

  // Sentry Replay 는 init 시점 URL 을 녹화한다 — main.tsx 모듈 본문에서 먼저 걷어낸다.
  it("stashes the token out of the url synchronously before any async work", () => {
    setUrl("?impersonateToken=tok-123&sport=run");

    stashImpersonationToken();

    expect(window.location.search).toBe("?sport=run");
    expect(hasImpersonationTokenInUrl()).toBe(false);
  });

  it("consumes a token stashed earlier by the module body", async () => {
    setUrl("?impersonateToken=tok-123");
    stashImpersonationToken();
    signInWithCustomToken.mockResolvedValue(credential({ impersonated: true, impersonatedBy: "moon" }));

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), "tok-123");
    expect(readImpersonationState()).toMatchObject({ by: "moon" });
  });

  it("signs out when the impersonation state cannot be stored", async () => {
    setUrl("?impersonateToken=tok-123");
    signInWithCustomToken.mockResolvedValue(credential({ impersonated: true }));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);
    setItem.mockRestore();

    expect(signOut).toHaveBeenCalled();
    expect(readImpersonationState()).toBeNull();
    expect(logClientError).toHaveBeenCalledWith(
      "Impersonation.stateWriteFailed",
      expect.any(Error),
      expect.anything(),
    );
  });

  it("removes the token from the url before awaiting any async auth work", async () => {
    setUrl("?impersonateToken=tok-123");
    let urlDuringSignIn = "";
    signInWithCustomToken.mockImplementation(async () => {
      urlDuringSignIn = window.location.search;
      return credential({ impersonated: true });
    });

    await applyImpersonationTokenFromUrl({ currentUser: null } as never);

    expect(urlDuringSignIn).not.toContain("impersonateToken");
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
