import { beforeEach, describe, expect, it, vi } from "vitest";

import { setDocData } from "../../../__tests__/mocks/firebase";
import { getActivityStreams } from "../../../services/personalDataApi";
import {
  loadCanonicalActivityStreams,
  usesCanonicalActivityStreams,
} from "./useActivityStreamsLoader";

vi.mock("../../../services/personalDataApi", () => ({
  getActivityStreams: vi.fn(),
}));

describe("canonical activity streams", () => {
  beforeEach(() => {
    vi.mocked(getActivityStreams).mockReset();
  });

  it("loads a GCS-backed document through the authenticated REST API", async () => {
    setDocData("activity_streams/gcs-activity", {
      userId: "owner-1",
      storage: "gcs",
      gcsPath: "streams/owner-1/gcs-activity.json.gz",
    });
    vi.mocked(getActivityStreams).mockResolvedValue({
      time: [0, 1],
      altitude: [10, 11],
    });

    await expect(loadCanonicalActivityStreams("gcs-activity")).resolves.toEqual({
      userId: "owner-1",
      time: [0, 1],
      altitude: [10, 11],
    });
    expect(getActivityStreams).toHaveBeenCalledWith("gcs-activity");
  });

  it("keeps loading legacy inline JSON without making a REST request", async () => {
    setDocData("activity_streams/inline-activity", {
      userId: "owner-2",
      json: JSON.stringify({ time: [0, 2], watts: [100, 120] }),
    });

    await expect(loadCanonicalActivityStreams("inline-activity")).resolves.toEqual({
      userId: "owner-2",
      time: [0, 2],
      watts: [100, 120],
    });
    expect(getActivityStreams).not.toHaveBeenCalled();
  });

  it("propagates GCS REST failures for the detail error state", async () => {
    setDocData("activity_streams/broken-gcs", {
      storage: "gcs",
      gcsPath: "streams/owner-3/broken.json.gz",
    });
    vi.mocked(getActivityStreams).mockRejectedValue(new Error("Stream data file not available"));

    await expect(loadCanonicalActivityStreams("broken-gcs", "owner-3")).rejects.toThrow(
      "Stream data file not available",
    );
  });

  it.each([
    ["activity-1", "orider"],
    ["activity-2", "apple_health"],
    ["activity-3", "health_connect"],
    ["orider_legacy", undefined],
    ["hs_legacy", undefined],
  ] as const)("uses the canonical loader for %s (%s)", (activityId, source) => {
    expect(usesCanonicalActivityStreams(activityId, source)).toBe(true);
  });

  it("keeps Strava on its provider-specific stream loader", () => {
    expect(usesCanonicalActivityStreams("strava_123", "strava")).toBe(false);
  });
});
