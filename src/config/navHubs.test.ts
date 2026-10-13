import { describe, it, expect } from "vitest";
import { getActiveHub, getHub, isHubSubRoute, PRIMARY_HUBS } from "./navHubs";

describe("navHubs", () => {
  describe("getActiveHub", () => {
    it("허브 루트/서브 경로를 올바른 허브로 매핑", () => {
      expect(getActiveHub("/")).toBe("home");
      expect(getActiveHub("/fitness")).toBe("coach");
      expect(getActiveHub("/plan")).toBe("coach");
      expect(getActiveHub("/log")).toBe("coach");
      expect(getActiveHub("/goal-setup")).toBe("coach");
      expect(getActiveHub("/coach")).toBe("coach");
      expect(getActiveHub("/courses")).toBe("explore");
      expect(getActiveHub("/explore")).toBe("explore");
      expect(getActiveHub("/discover")).toBe("explore");
      expect(getActiveHub("/leaderboard")).toBe("explore");
      expect(getActiveHub("/board")).toBe("community");
      expect(getActiveHub("/creator")).toBe("community");
      expect(getActiveHub("/groups")).toBe("club");
      expect(getActiveHub("/events")).toBe("explore");
      expect(getActiveHub("/friends")).toBe("settings");
      expect(getActiveHub("/community")).toBe("home");
      expect(getActiveHub("/about")).toBe("settings");
      expect(getActiveHub("/social")).toBe("settings");
      expect(getActiveHub("/my")).toBe("settings");
      expect(getActiveHub("/settings")).toBe("settings");
    });

    it("상세 경로도 부모 허브로 매핑", () => {
      expect(getActiveHub("/course/abc")).toBe("explore");
      expect(getActiveHub("/segment/create")).toBe("explore");
      expect(getActiveHub("/segment/abc")).toBe("explore");
      expect(getActiveHub("/board/123")).toBe("community");
      expect(getActiveHub("/group/g1")).toBe("club");
      expect(getActiveHub("/event/e1")).toBe("explore");
      expect(getActiveHub("/athlete/u1")).toBe("settings");
      expect(getActiveHub("/friend/invite-code")).toBe("settings");
      expect(getActiveHub("/coach/thread-1")).toBe("coach");
      expect(getActiveHub("/policies/ai-coach")).toBe("home");
    });

    it("모든 활동 상세·하위 경로는 홈으로 고정", () => {
      expect(getActiveHub("/activity/xyz")).toBe("home");
      expect(getActiveHub("/activity/xyz/edit")).toBe("home");
    });

    it("목표·연간 기록·라이브를 지정 허브로 매핑", () => {
      expect(getActiveHub("/goal/climb")).toBe("coach");
      expect(getActiveHub("/year-recap")).toBe("coach");
      expect(getActiveHub("/live/event-1")).toBe("explore");
    });

    it("매칭 없는 경로는 home 폴백", () => {
      expect(getActiveHub("/unknown")).toBe("home");
    });
  });

  describe("isHubSubRoute", () => {
    it("허브 서브 목적지(목록/루트)에선 true", () => {
      for (const p of ["/fitness", "/plan", "/goal-setup", "/coach", "/discover", "/explore", "/courses", "/board", "/creator", "/events", "/my", "/settings"]) {
        expect(isHubSubRoute(p)).toBe(true);
      }
    });

    it("상세·흐름·홈 경로에선 false (서브탭바 미노출)", () => {
      for (const p of ["/", "/board/123", "/group/g1", "/segment/s1", "/segment/create", "/course/c1", "/event/e1", "/goal/climb", "/activity/xyz", "/social", "/groups", "/log", "/year-recap", "/leaderboard", "/friends", "/about"]) {
        expect(isHubSubRoute(p)).toBe(false);
      }
    });
  });

  it("getHub 은 key 로 허브를 반환", () => {
    expect(getHub("coach").subs.map((s) => s.to)).toEqual(["/fitness", "/plan", "/goal-setup", "/coach"]);
    expect(getHub("explore").subs.map((s) => s.to)).toEqual(["/courses", "/explore", "/events", "/discover"]);
    expect(getHub("community").subs.map((s) => s.to)).toEqual(["/board", "/creator"]);
    expect(getHub("home").subs).toHaveLength(0);
    expect(getHub("club").subs).toHaveLength(0);
  });

  it("exposes exactly five ordered primary hubs while keeping settings utility-only", () => {
    expect(PRIMARY_HUBS.map((hub) => hub.key)).toEqual(["home", "coach", "club", "explore", "community"]);
    expect(PRIMARY_HUBS.map((hub) => hub.to)).toEqual(["/", "/fitness", "/groups", "/courses", "/board"]);
    expect(PRIMARY_HUBS.some((hub) => hub.key === "settings")).toBe(false);
    expect(getActiveHub("/settings")).toBe("settings");
  });
});
