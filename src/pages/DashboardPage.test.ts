import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Activity } from "@shared/types";
import { dashboardPlanDiscipline, filterFeedActivities, normalizeDashboardDiscipline } from "./DashboardPage";

function activity(id: string, userId: string): Activity {
  return {
    id,
    userId,
    nickname: userId,
    profileImage: null,
    type: "Ride",
    createdAt: 1,
    startTime: 1,
    endTime: 2,
    summary: {
      distance: 1000,
      ridingTimeMillis: 1000,
      averageSpeed: 1,
      maxSpeed: 1,
      elevationGain: 1,
    },
    thumbnailTrack: "",
    groupId: null,
    groupRideId: null,
    photoCount: 0,
    kudosCount: 0,
    commentCount: 0,
    segmentEffortCount: 0,
    description: "",
    visibility: "everyone",
    gpxPath: null,
  };
}

describe("filterFeedActivities", () => {
  const activities = [
    activity("mine", "me"),
    activity("friend", "friend-1"),
    activity("public-other", "other-1"),
  ];

  it("returns all activities for the all filter", () => {
    expect(filterFeedActivities(activities, 0, "me", new Set(["friend-1"])).map((a) => a.id))
      .toEqual(["mine", "friend", "public-other"]);
  });

  it("returns only actual friends for the friends filter", () => {
    expect(filterFeedActivities(activities, 1, "me", new Set(["friend-1"])).map((a) => a.id))
      .toEqual(["friend"]);
  });

  it("returns only my activities for the self filter", () => {
    expect(filterFeedActivities(activities, 2, "me", new Set(["friend-1"])).map((a) => a.id))
      .toEqual(["mine"]);
  });
});

describe("normalizeDashboardDiscipline", () => {
  it.each(["bike", "run", "swim", "tri"] as const)("accepts %s", (discipline) => {
    expect(normalizeDashboardDiscipline(discipline)).toBe(discipline);
  });

  it.each([null, "all", "rowing", "RUN"])("rejects unsupported value %s", (discipline) => {
    expect(normalizeDashboardDiscipline(discipline)).toBeNull();
  });

  it.each([
    ["bike", "bike"],
    ["run", "run"],
    ["swim", "swim"],
    ["tri", undefined],
    ["all", undefined],
    ["rowing", undefined],
    [null, undefined],
  ] as const)("maps %s to the safe plan-link discipline", (value, expected) => {
    expect(dashboardPlanDiscipline(value)).toBe(expected);
  });

});

describe("desktop dashboard information hierarchy", () => {
  it("keeps Home focused on activity and informational cards without a workout decision", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/DashboardPage.tsx"), "utf8");
    expect(source).not.toContain("TodayTrainingDecisionCard");
    expect(source).not.toContain("TodaysWorkoutCard");
    expect(source).not.toContain("CoachQuestionLauncher");
  });
});
