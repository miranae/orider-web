import { describe, it, expect } from "vitest";
import { getActiveHub, getHub, isDetailRoute, resolveDetailHub, isHubSubRoute, PRIMARY_HUBS } from "./navHubs";

describe("navHubs", () => {
  describe("getActiveHub", () => {
    it("허브 루트/서브 경로를 올바른 허브로 매핑", () => {
      expect(getActiveHub("/")).toBe("home");
      expect(getActiveHub("/coach/condition")).toBe("coach");
      expect(getActiveHub("/coach/plan")).toBe("coach");
      expect(getActiveHub("/coach/goals")).toBe("coach");
      expect(getActiveHub("/goal-setup")).toBe("coach");
      expect(getActiveHub("/coach/chat")).toBe("coach");
      expect(getActiveHub("/explore/courses")).toBe("explore");
      expect(getActiveHub("/explore/segments")).toBe("explore");
      expect(getActiveHub("/explore/challenges")).toBe("explore");
      expect(getActiveHub("/explore/segments/leaderboard")).toBe("explore");
      expect(getActiveHub("/explore/events")).toBe("explore");
      expect(getActiveHub("/community/board")).toBe("community");
      expect(getActiveHub("/explore/recipes")).toBe("explore");
      expect(getActiveHub("/clubs")).toBe("club");
      expect(getActiveHub("/athlete/me")).toBe("settings");
      expect(getActiveHub("/athlete/me/activities")).toBe("settings");
      expect(getActiveHub("/athlete/me/records")).toBe("settings");
      expect(getActiveHub("/athlete/me/friends")).toBe("settings");
      expect(getActiveHub("/athlete/me/gear")).toBe("settings");
      expect(getActiveHub("/policies/community")).toBe("home");
      expect(getActiveHub("/about")).toBe("settings");
      expect(getActiveHub("/settings/account")).toBe("settings");
      expect(getActiveHub("/settings/training")).toBe("settings");
    });

    it("상세 경로도 부모 허브로 매핑", () => {
      expect(getActiveHub("/course/abc")).toBe("explore");
      expect(getActiveHub("/segment/create")).toBe("explore");
      expect(getActiveHub("/segment/abc")).toBe("explore");
      expect(getActiveHub("/community/board/123")).toBe("community");
      expect(getActiveHub("/explore/recipes/deploy")).toBe("explore");
      expect(getActiveHub("/club/g1")).toBe("club");
      expect(getActiveHub("/club/g1/rides/r1")).toBe("club");
      expect(getActiveHub("/group/join/CODE")).toBe("club");
      expect(getActiveHub("/event/e1")).toBe("explore");
      expect(getActiveHub("/event/e1/host")).toBe("explore");
      expect(getActiveHub("/athlete/u1")).toBe("settings");
      expect(getActiveHub("/friend/invite-code")).toBe("settings");
      expect(getActiveHub("/coach/chat/thread-1")).toBe("coach");
      expect(getActiveHub("/policies/ai-coach")).toBe("home");
    });

    it("모든 활동 상세·하위 경로는 홈으로 고정", () => {
      expect(getActiveHub("/activity/xyz")).toBe("home");
      expect(getActiveHub("/activity/xyz/edit")).toBe("home");
    });

    it("목표·라이브를 지정 허브로 매핑", () => {
      expect(getActiveHub("/goal/climb")).toBe("coach");
      expect(getActiveHub("/live/event-1")).toBe("explore");
    });

    it("매칭 없는 경로는 home 폴백", () => {
      expect(getActiveHub("/unknown")).toBe("home");
    });
  });

  describe("isHubSubRoute", () => {
    it("허브 서브 목적지(목록/루트)에선 true", () => {
      for (const p of ["/coach/condition", "/coach/today", "/coach/plan", "/coach/goals", "/coach/analysis", "/coach/chat", "/explore/challenges", "/explore/segments", "/explore/courses", "/explore/events", "/explore/recipes", "/athlete/me", "/settings/account"]) {
        expect(isHubSubRoute(p)).toBe(true);
      }
    });

    it("상세·흐름·홈 경로에선 false (서브탭바 미노출)", () => {
      for (const p of ["/", "/community/board/123", "/club/g1", "/segment/s1", "/segment/create", "/course/c1", "/event/e1", "/goal/climb", "/goal-setup", "/activity/xyz", "/clubs", "/athlete/me/activities", "/athlete/me/records", "/explore/segments/leaderboard", "/athlete/me/friends", "/about"]) {
        expect(isHubSubRoute(p)).toBe(false);
      }
    });
  });

  it("getHub 은 key 로 허브를 반환", () => {
    expect(getHub("coach").subs.map((s) => s.to)).toEqual(["/coach/condition", "/coach/today", "/coach/plan", "/coach/goals", "/coach/analysis", "/coach/chat"]);
    expect(getHub("explore").subs.map((s) => s.to)).toEqual(["/explore/courses", "/explore/segments", "/explore/events", "/explore/challenges", "/explore/recipes"]);
    expect(getHub("community").subs).toHaveLength(0);
    expect(getHub("settings").subs.map((s) => s.to)).toEqual(["/athlete/me", "/settings/account"]);
    expect(getHub("home").subs).toHaveLength(0);
    expect(getHub("club").subs).toHaveLength(0);
  });

  it("exposes exactly five ordered primary hubs while keeping settings utility-only", () => {
    expect(PRIMARY_HUBS.map((hub) => hub.key)).toEqual(["home", "coach", "club", "explore", "community"]);
    expect(PRIMARY_HUBS.map((hub) => hub.to)).toEqual(["/", "/coach/condition", "/clubs", "/explore/courses", "/community/board"]);
    expect(PRIMARY_HUBS.some((hub) => hub.key === "settings")).toBe(false);
    expect(getActiveHub("/settings/account")).toBe("settings");
  });
});

describe("detail flow route boundaries", () => {
  it.each(["/event/e1", "/event/e1/register", "/event/e1/results", "/event/e1/host", "/event/e1/host/edit", "/event/e1/host/participants", "/activity/a1/edit", "/course/c1/edit"])("retains a valid entry hub on %s", path => {
    expect(isDetailRoute(path)).toBe(true);
    expect(resolveDetailHub(path, { fromHub: "club" })).toBe("club");
  });
  it.each(["/event/create", "/event/create/results", "/event/new", "/event/list", "/event/e1/host/new", "/event/e1/results/extra", "/event/e1/unknown", "/athlete/me", "/athlete/me/activities", "/athlete/me/records", "/athlete/u1/records", "/course/create/edit", "/segment/create", "/segment/s1/edit", "/activity/a1/analysis", "/explore/events", "/clubs", "/settings/device"])("does not misclassify utility/list/unknown path %s", path => {
    expect(isDetailRoute(path)).toBe(false);
    expect(resolveDetailHub(path, { fromHub: "coach" })).toBe(getActiveHub(path));
  });
  it("uses stable direct-entry defaults and rejects invalid origins on nested detail flows", () => {
    expect(resolveDetailHub("/event/e1/results")).toBe("explore");
    expect(resolveDetailHub("/event/e1/register", { fromHub: "settings" })).toBe("explore");
    expect(resolveDetailHub("/activity/a1/edit")).toBe("home");
    expect(resolveDetailHub("/course/c1/edit")).toBe("explore");
  });
});
