import { describe, expect, it } from "vitest";
import { stravaMobileCallbackUrl } from "./stravaMobileCallback";

describe("모바일 Strava 콜백", () => {
  const state = "mobile:12345678-1234-1234-1234-123456789abc";
  it("계정별 중첩 요청의 식별자와 코드를 그대로 앱에 전달한다", () => {
    const params = new URLSearchParams({ state, code: "a+b&c", scope: "activity:read_all" });
    const url = new URL(stravaMobileCallbackUrl(params)!);
    expect(url.protocol).toBe("orider:");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("code")).toBe("a+b&c");
    expect(url.searchParams.get("scope")).toBe("activity:read_all");
  });
  it("취소 응답에도 같은 요청 식별자를 보존한다", () => {
    const url = new URL(stravaMobileCallbackUrl(new URLSearchParams({ state, error: "access_denied" }))!);
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("error")).toBe("access_denied");
  });
  it("기존 앱 모바일 콜백을 유지한다", () => {
    expect(stravaMobileCallbackUrl(new URLSearchParams({ state: "mobile", code: "legacy" }))).toContain("code=legacy");
  });
  it.each(["web-nonce", "mobile:invalid", "mobile:https://example.com", ""])("웹 또는 손상된 state는 앱으로 보내지 않는다 %s", (candidate) => {
    expect(stravaMobileCallbackUrl(new URLSearchParams({ state: candidate, code: "code" }))).toBeNull();
  });
});
