import { describe, expect, it, vi } from "vitest";

vi.mock("./firebase", () => ({ auth: {}, functions: {}, ensureAppCheckReady: vi.fn() }));
vi.mock("./errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));

import { extractHandoffCode, HANDOFF_PARAM } from "./appHandoff";

const VALID = "A".repeat(43);

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
