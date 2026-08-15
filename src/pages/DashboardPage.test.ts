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
  it("replaces the workout and coach panels with a plan link before running informational cards", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/DashboardPage.tsx"), "utf8");
    const mobileBranch = source.indexOf("if (isMobile)");
    const planLink = source.indexOf("<TodayPlanLink discipline=", mobileBranch);
    const recap = source.indexOf("<WeeklyRecapCard", mobileBranch);
    const threshold = source.indexOf("<ThresholdPaceNudge", mobileBranch);
    const shoe = source.indexOf("<ShoeReplacementBadge", mobileBranch);
    const crossTraining = source.indexOf("<CrossDisciplineLoadCard", mobileBranch);

    expect(mobileBranch).toBeGreaterThan(-1);
    expect(planLink).toBeGreaterThan(mobileBranch);
    expect(planLink).toBeLessThan(recap);
    expect(planLink).toBeLessThan(threshold);
    expect(planLink).toBeLessThan(shoe);
    expect(planLink).toBeLessThan(crossTraining);
    expect(source).not.toContain("TodaysWorkoutCard");
    expect(source).not.toContain("CoachQuestionLauncher");
  });
});
