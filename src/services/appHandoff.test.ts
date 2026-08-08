import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./firebase", () => ({ auth: {}, functions: {}, ensureAppCheckReady: vi.fn() }));
vi.mock("./errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));

import { signInWithCustomToken } from "firebase/auth";
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

  it("코드가 없으면 null, URL 도 건드리지 않는다", () => {
    const replace = vi.fn();
    expect(extractHandoffCode("https://orider.co.kr/ko/board", replace)).toBeNull();
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
    expect(ensureAppCheckReady).toHaveBeenCalled();
    expect(redeem).toHaveBeenCalledWith({ code: VALID });
    expect(signInWithCustomToken).toHaveBeenCalledWith({}, "custom-token");
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
    expect(signInWithCustomToken).toHaveBeenCalledWith({}, "custom-token");
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
