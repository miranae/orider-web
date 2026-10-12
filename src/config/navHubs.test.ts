import { describe, it, expect } from "vitest";
import { getActiveHub, getHub, isHubSubRoute, PRIMARY_HUBS } from "./navHubs";

describe("navHubs", () => {
  describe("getActiveHub", () => {
    it("허브 루트/서브 경로를 올바른 허브로 매핑", () => {
      expect(getActiveHub("/")).toBe("feed");
      expect(getActiveHub("/fitness")).toBe("train");
      expect(getActiveHub("/plan")).toBe("train");
      expect(getActiveHub("/log")).toBe("train");
      expect(getActiveHub("/goal-setup")).toBe("train");
      expect(getActiveHub("/goal/climb")).toBe("train");
      expect(getActiveHub("/year-recap")).toBe("train");
      expect(getActiveHub("/creator/docs")).toBe("settings");
      expect(getActiveHub("/coach")).toBe("train");
      expect(getActiveHub("/courses")).toBe("explore");
      expect(getActiveHub("/explore")).toBe("explore");
      expect(getActiveHub("/discover")).toBe("explore");
      expect(getActiveHub("/leaderboard")).toBe("explore");
      expect(getActiveHub("/board")).toBe("people");
      expect(getActiveHub("/creator")).toBe("settings");
      expect(getActiveHub("/groups")).toBe("club");
      expect(getActiveHub("/events")).toBe("club");
      expect(getActiveHub("/friends")).toBe("people");
      expect(getActiveHub("/community")).toBe("people");
      expect(getActiveHub("/about")).toBe("settings");
      expect(getActiveHub("/social")).toBe("people");
      expect(getActiveHub("/my")).toBe("settings");
      expect(getActiveHub("/settings")).toBe("settings");
    });

    it("상세 경로도 부모 허브로 매핑", () => {
      expect(getActiveHub("/course/abc")).toBe("explore");
      expect(getActiveHub("/segment/create")).toBe("explore");
      expect(getActiveHub("/segment/abc")).toBe("explore");
      expect(getActiveHub("/board/123")).toBe("people");
      expect(getActiveHub("/group/g1")).toBe("club");
      expect(getActiveHub("/event/e1")).toBe("club");
      expect(getActiveHub("/athlete/u1")).toBe("people");
      expect(getActiveHub("/friend/invite-code")).toBe("people");
      expect(getActiveHub("/coach/thread-1")).toBe("train");
      expect(getActiveHub("/policies/ai-coach")).toBe("feed");
    });

    it("활동 상세는 확인된 소유권에 따라 홈 또는 내 운동으로 매핑", () => {
      expect(getActiveHub("/activity/xyz")).toBe("feed");
      expect(getActiveHub("/activity/xyz", { viewerUid: "me", activityOwnerId: null })).toBe("feed");
      expect(getActiveHub("/activity/xyz", { viewerUid: "me", activityOwnerId: "other" })).toBe("feed");
      expect(getActiveHub("/activity/xyz", { viewerUid: "me", activityOwnerId: "me" })).toBe("train");
      expect(getActiveHub("/activity/xyz", { viewerUid: null, activityOwnerId: "me" })).toBe("feed");
      expect(getActiveHub("/activity/xyz/edit")).toBe("train");
    });

    it("매칭 없는 경로는 feed 폴백", () => {
      expect(getActiveHub("/unknown")).toBe("feed");
    });
  });

  describe("isHubSubRoute", () => {
    it("허브 서브 목적지(목록/루트)에선 true", () => {
      for (const p of ["/fitness", "/plan", "/log", "/coach", "/discover", "/explore", "/leaderboard", "/courses", "/board", "/groups", "/events", "/friends", "/my", "/settings"]) {
        expect(isHubSubRoute(p)).toBe(true);
      }
    });

    it("상세·흐름·홈 경로에선 false (서브탭바 미노출)", () => {
      for (const p of ["/", "/board/123", "/group/g1", "/segment/s1", "/segment/create", "/course/c1", "/event/e1", "/goal-setup", "/activity/xyz", "/social"]) {
        expect(isHubSubRoute(p)).toBe(false);
      }
    });
  });

  it("getHub 은 key 로 허브를 반환", () => {
    expect(getHub("train").subs.map((s) => s.to)).toEqual(["/log", "/fitness", "/plan", "/coach"]);
    expect(getHub("explore").subs.map((s) => s.to)).toEqual(["/discover", "/explore", "/leaderboard", "/courses"]);
    expect(getHub("club").subs.map((s) => s.to)).toEqual(["/groups", "/events"]);
    expect(getHub("people").subs.map((s) => s.to)).toEqual(["/friends", "/board"]);
    expect(getHub("settings").subs.map((s) => s.to)).toEqual(["/my", "/settings"]);
    // 공개 페이지에 로그인 전용 설정 서브탭이 붙지 않는다
    expect(isHubSubRoute("/about")).toBe(false);
    expect(isHubSubRoute("/creator")).toBe(false);
    expect(getHub("feed").subs).toHaveLength(0);
  });

  it("exposes exactly five ordered primary hubs while keeping settings utility-only", () => {
    expect(PRIMARY_HUBS.map((hub) => hub.key)).toEqual(["feed", "train", "club", "explore", "people"]);
    expect(PRIMARY_HUBS.map((hub) => hub.to)).toEqual(["/", "/log", "/groups", "/discover", "/friends"]);
    expect(PRIMARY_HUBS.some((hub) => hub.key === "settings")).toBe(false);
    expect(getActiveHub("/settings")).toBe("settings");
  });
});
