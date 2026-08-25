import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
  authStateReady: vi.fn<() => Promise<void>>(),
}));

vi.mock("./firebase", () => ({ auth: mockAuth, functions: {}, ensureAppCheckReady: vi.fn() }));
vi.mock("./errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: vi.fn(), signOut: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));

import { signInWithCustomToken, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady } from "./firebase";
import {
  consumeAppHandoffCode,
  didHandoffFail,
  extractHandoffCode,
  HANDOFF_PARAM,
  stashHandoffCode,
} from "./appHandoff";

const VALID = "A".repeat(43);

function setPageUrl(path: string) {
  window.history.replaceState(null, "", path);
}

beforeEach(() => {
  mockAuth.currentUser = null;
  mockAuth.authStateReady.mockReset().mockResolvedValue();
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue();
  vi.mocked(signOut).mockReset().mockResolvedValue();
  vi.mocked(signInWithCustomToken).mockReset();
  vi.mocked(httpsCallable).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  didHandoffFail(); // 플래그 리셋
  setPageUrl("/");
});

describe("extractHandoffCode", () => {
  it("valid 코드를 반환하고 URL 에서 handoff 파라미터만 제거한다", () => {
    const replace = vi.fn();
    const code = extractHandoffCode(
      `https://orider.co.kr/ko/board?${HANDOFF_PARAM}=${VALID}&tab=all`,
      replace,
    );
    expect(code).toBe(VALID);
    expect(replace).toHaveBeenCalledWith("https://orider.co.kr/ko/board?tab=all");
  });

  it("fragment 코드를 우선하고 query·fragment 의 handoff 키만 모두 제거한다", () => {
    const replace = vi.fn();
    const fragmentCode = "B".repeat(43);
    const code = extractHandoffCode(
      `https://orider.co.kr/ko/board?handoff=${VALID}&tab=all` +
        `#section&handoff=${fragmentCode}&impersonateToken=tok-123`,
      replace,
    );

    expect(code).toBe(fragmentCode);
    expect(replace).toHaveBeenCalledWith(
      "https://orider.co.kr/ko/board?tab=all#section&impersonateToken=tok-123",
    );
  });

  it("fragment 의 위임 토큰과 다른 파라미터를 보존한다", () => {
    const replace = vi.fn();
    const code = extractHandoffCode(
      `https://orider.co.kr/ko/#impersonateToken=tok-123&handoff=${VALID}&view=summary`,
      replace,
    );

    expect(code).toBe(VALID);
    expect(replace).toHaveBeenCalledWith(
      "https://orider.co.kr/ko/#impersonateToken=tok-123&view=summary",
    );
  });

  it("코드가 없으면 null, URL 도 건드리지 않는다", () => {
    const replace = vi.fn();
    expect(extractHandoffCode("https://orider.co.kr/ko/board#training", replace)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("형식이 틀린 코드는 null 을 반환하되 파라미터는 제거한다", () => {
    const replace = vi.fn();
    expect(
      extractHandoffCode(`https://orider.co.kr/?${HANDOFF_PARAM}=short`, replace),
    ).toBeNull();
    expect(replace).toHaveBeenCalledWith("https://orider.co.kr/");
  });
});

describe("stash → consume", () => {
  it("stash 는 URL 에서 코드를 동기 제거하고, consume 이 redeem→signIn 한다", async () => {
    setPageUrl(`/ko/board?${HANDOFF_PARAM}=${VALID}`);
    const redeem = vi.fn().mockResolvedValue({ data: { token: "custom-token" } });
    vi.mocked(httpsCallable).mockReturnValue(redeem as never);

    stashHandoffCode();
    expect(window.location.search).toBe(""); // 코드가 즉시 URL 에서 사라짐

    await consumeAppHandoffCode();
    expect(mockAuth.authStateReady).toHaveBeenCalled();
    expect(ensureAppCheckReady).toHaveBeenCalled();
    expect(redeem).toHaveBeenCalledWith({ code: VALID });
    expect(signInWithCustomToken).toHaveBeenCalledWith(mockAuth, "custom-token");
    expect(didHandoffFail()).toBe(false);
  });

  it("지연 복원된 기존 세션을 로그아웃한 뒤 redeem 실패를 비로그인으로 계속한다", async () => {
    setPageUrl(`/#${HANDOFF_PARAM}=${VALID}`);
    let finishHydration!: () => void;
    mockAuth.authStateReady.mockImplementation(() => new Promise<void>((resolve) => {
      finishHydration = () => {
        mockAuth.currentUser = { uid: "existing-user" };
        resolve();
      };
    }));
    const redeem = vi.fn().mockRejectedValue(new Error("expired"));
    vi.mocked(httpsCallable).mockReturnValue(redeem as never);

    stashHandoffCode();
    const consume = consumeAppHandoffCode();
    await vi.waitFor(() => expect(mockAuth.authStateReady).toHaveBeenCalled());
    expect(redeem).not.toHaveBeenCalled();

    finishHydration();
    await expect(consume).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledWith(mockAuth);
    expect(redeem).toHaveBeenCalledWith({ code: VALID });
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(didHandoffFail()).toBe(true);
  });

  it("기존 세션 로그아웃 실패는 reject 하여 redeem 과 마운트 연속 실행을 막는다", async () => {
    setPageUrl(`/#${HANDOFF_PARAM}=${VALID}`);
    mockAuth.currentUser = { uid: "existing-user" };
    const signOutError = new Error("auth/network-request-failed");
    vi.mocked(signOut).mockRejectedValue(signOutError);
    const redeem = vi.fn();
    vi.mocked(httpsCallable).mockReturnValue(redeem as never);
    const mount = vi.fn();

    stashHandoffCode();
    await expect(consumeAppHandoffCode().then(mount)).rejects.toBe(signOutError);
    expect(redeem).not.toHaveBeenCalled();
    expect(ensureAppCheckReady).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
    expect(didHandoffFail()).toBe(false);
  });

  it("redeem 실패는 삼키고 didHandoffFail 플래그만 세운다 (마운트 진행 보장)", async () => {
    setPageUrl(`/?${HANDOFF_PARAM}=${VALID}`);
    vi.mocked(httpsCallable).mockReturnValue(
      vi.fn().mockRejectedValue(new Error("expired")) as never,
    );

    stashHandoffCode();
    await expect(consumeAppHandoffCode()).resolves.toBeUndefined();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(didHandoffFail()).toBe(true);
    expect(didHandoffFail()).toBe(false); // 1회 읽으면 리셋
  });

  it("5초를 넘는 App Check 준비도 완료되면 인계를 계속한다", async () => {
    vi.useFakeTimers();
    setPageUrl(`/?${HANDOFF_PARAM}=${VALID}`);
    let resolveAppCheck!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { resolveAppCheck = resolve; }));
    const redeem = vi.fn().mockResolvedValue({ data: { token: "custom-token" } });
    vi.mocked(httpsCallable).mockReturnValue(redeem as never);

    stashHandoffCode();
    const consume = consumeAppHandoffCode();
    await vi.advanceTimersByTimeAsync(5_001);
    resolveAppCheck();
    await consume;

    expect(redeem).toHaveBeenCalledWith({ code: VALID });
    expect(signInWithCustomToken).toHaveBeenCalledWith(mockAuth, "custom-token");
    expect(didHandoffFail()).toBe(false);
  });

  it("App Check hang 시 상한 이후 마운트를 진행한다", async () => {
    vi.useFakeTimers();
    setPageUrl(`/?${HANDOFF_PARAM}=${VALID}`);
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise(() => {})); // 영원히 pending

    stashHandoffCode();
    const consume = consumeAppHandoffCode();
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(consume).resolves.toBeUndefined();
    expect(didHandoffFail()).toBe(true);
  });

  it("코드가 없으면 아무것도 하지 않는다", async () => {
    stashHandoffCode();
    await consumeAppHandoffCode();
    expect(ensureAppCheckReady).not.toHaveBeenCalled();
    expect(didHandoffFail()).toBe(false);
  });
});
