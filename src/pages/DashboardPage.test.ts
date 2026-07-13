import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Activity } from "@shared/types";
import { filterFeedActivities } from "./DashboardPage";

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

describe("desktop dashboard information hierarchy", () => {
  it("places today's workout action before running informational cards without changing the mobile branch", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/DashboardPage.tsx"), "utf8");
    const mobileBranch = source.indexOf("if (isMobile)");
    const workout = source.indexOf("<TodaysWorkoutCard />", mobileBranch);
    const recap = source.indexOf("<WeeklyRecapCard", mobileBranch);
    const threshold = source.indexOf("<ThresholdPaceNudge", mobileBranch);
    const shoe = source.indexOf("<ShoeReplacementBadge", mobileBranch);
    const crossTraining = source.indexOf("<CrossDisciplineLoadCard", mobileBranch);

    expect(mobileBranch).toBeGreaterThan(-1);
    expect(workout).toBeGreaterThan(mobileBranch);
    expect(workout).toBeLessThan(recap);
    expect(workout).toBeLessThan(threshold);
    expect(workout).toBeLessThan(shoe);
    expect(workout).toBeLessThan(crossTraining);
  });
});
