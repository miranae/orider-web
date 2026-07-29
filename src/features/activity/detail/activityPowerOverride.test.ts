import { describe, expect, it } from "vitest";
import type { ActivityStreams } from "@shared/types";

import type { ActivityPowerOverride } from "./activityDetailDerived";
import {
  buildActivityPowerSourceFingerprint,
  resolveActiveActivityPowerOverride,
} from "./activityPowerOverride";

const params = { riderWeightKg: 70, bikeWeightKg: 9, rollingResistance: 0.005, cdA: 0.32 };

function makeStreams(): ActivityStreams {
  return {
    time: [0, 1, 2, 3],
    velocity_smooth: [5, 5, 5, 5],
    altitude: [10, 11, 12, 13],
    watts: [10, 20, 30, 40],
  } as ActivityStreams;
}

function makeOverride(streams: ActivityStreams): ActivityPowerOverride {
  return {
    source: "virtualPowerOverride",
    activityId: "activity-a",
    sourceFingerprint: buildActivityPowerSourceFingerprint(streams)!,
    params,
    values: [100, 200, 300, 400],
    time: [0, 1, 2, 3],
  };
}

describe("activity power override provenance", () => {
  it("accepts only the exact activity, loaded document, source generation, and parameters", () => {
    const streams = makeStreams();
    const override = makeOverride(streams);

    expect(resolveActiveActivityPowerOverride("activity-a", "activity-a", streams, override, params))
      .toBe(override);
    expect(resolveActiveActivityPowerOverride("activity-b", "activity-b", streams, override, params))
      .toBeNull();
    expect(resolveActiveActivityPowerOverride("activity-a", "activity-b", streams, override, params))
      .toBeNull();
  });

  it("invalidates an identical same-activity stream replacement", () => {
    const streams = makeStreams();
    const replacement = { ...streams };
    const override = makeOverride(streams);

    expect(resolveActiveActivityPowerOverride("activity-a", "activity-a", replacement, override, params))
      .toBeNull();
  });

  it("invalidates changed virtual-power calculation parameters", () => {
    const streams = makeStreams();
    const override = makeOverride(streams);

    expect(resolveActiveActivityPowerOverride("activity-a", "activity-a", streams, override, {
      ...params,
      cdA: 0.4,
    })).toBeNull();
    expect(resolveActiveActivityPowerOverride("activity-a", "activity-a", streams, override, null))
      .toBeNull();
  });
});
