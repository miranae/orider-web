import { describe, it, expect } from "vitest";
import { getActiveHub, getHub, isHubSubRoute } from "./navHubs";

describe("navHubs", () => {
  describe("getActiveHub", () => {
    it("허브 루트/서브 경로를 올바른 허브로 매핑", () => {
      expect(getActiveHub("/")).toBe("home");
      expect(getActiveHub("/fitness")).toBe("train");
      expect(getActiveHub("/plan")).toBe("train");
      expect(getActiveHub("/log")).toBe("train");
      expect(getActiveHub("/goal-setup")).toBe("train");
      expect(getActiveHub("/courses")).toBe("explore");
      expect(getActiveHub("/explore")).toBe("explore");
      expect(getActiveHub("/discover")).toBe("explore");
      expect(getActiveHub("/leaderboard")).toBe("explore");
      expect(getActiveHub("/board")).toBe("community");
      expect(getActiveHub("/creator")).toBe("community");
      expect(getActiveHub("/groups")).toBe("community");
      expect(getActiveHub("/events")).toBe("community");
      expect(getActiveHub("/friends")).toBe("community");
      expect(getActiveHub("/community")).toBe("community");
      expect(getActiveHub("/about")).toBe("community");
      expect(getActiveHub("/social")).toBe("community");
      expect(getActiveHub("/my")).toBe("settings");
      expect(getActiveHub("/settings")).toBe("settings");
    });

    it("상세 경로도 부모 허브로 매핑", () => {
      expect(getActiveHub("/course/abc")).toBe("explore");
      expect(getActiveHub("/segment/create")).toBe("explore");
      expect(getActiveHub("/segment/abc")).toBe("explore");
      expect(getActiveHub("/board/123")).toBe("community");
      expect(getActiveHub("/group/g1")).toBe("community");
      expect(getActiveHub("/event/e1")).toBe("community");
      expect(getActiveHub("/athlete/u1")).toBe("community");
      expect(getActiveHub("/friend/invite-code")).toBe("community");
    });

    it("활동 상세는 확인된 소유권에 따라 홈 또는 내 운동으로 매핑", () => {
      expect(getActiveHub("/activity/xyz")).toBe("home");
      expect(getActiveHub("/activity/xyz", { viewerUid: "me", activityOwnerId: null })).toBe("home");
      expect(getActiveHub("/activity/xyz", { viewerUid: "me", activityOwnerId: "other" })).toBe("home");
      expect(getActiveHub("/activity/xyz", { viewerUid: "me", activityOwnerId: "me" })).toBe("train");
      expect(getActiveHub("/activity/xyz", { viewerUid: null, activityOwnerId: "me" })).toBe("home");
      expect(getActiveHub("/activity/xyz/edit")).toBe("train");
    });

    it("매칭 없는 경로는 home 폴백", () => {
      expect(getActiveHub("/unknown")).toBe("home");
    });
  });

  describe("isHubSubRoute", () => {
    it("허브 서브 목적지(목록/루트)에선 true", () => {
      for (const p of ["/fitness", "/plan", "/log", "/discover", "/explore", "/leaderboard", "/courses", "/board", "/creator", "/groups", "/events", "/friends", "/about", "/my", "/settings"]) {
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
    expect(getHub("train").subs.map((s) => s.to)).toEqual(["/fitness", "/plan", "/log"]);
    expect(getHub("explore").subs.map((s) => s.to)).toEqual(["/discover", "/explore", "/leaderboard", "/courses"]);
    expect(getHub("community").subs.map((s) => s.to)).toEqual(["/board", "/creator", "/groups", "/events", "/friends", "/about"]);
    expect(getHub("home").subs).toHaveLength(0);
  });
});
