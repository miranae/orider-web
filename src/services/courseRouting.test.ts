import { describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import {
  COURSE_ROUTING_CALLABLE,
  CourseRoutingError,
  requestCourseRoute,
  validateCourseRoutingResult,
} from "./courseRouting";

vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("./firebase", () => ({ functions: {} }));

const result = {
  contractVersion: 1 as const,
  geometry: { type: "LineString" as const, coordinates: [[126.97, 37.56], [127.01, 37.57]] as [number, number][] },
  distanceM: 4_200,
  durationSeconds: 900,
  attribution: "Routing data © provider",
};

describe("courseRouting", () => {
  it("uses the provider-neutral callable without exposing provider credentials", async () => {
    vi.mocked(httpsCallable).mockReturnValue(vi.fn(async () => ({ data: result })) as never);
    await expect(requestCourseRoute(functions, {
      waypoints: [{ lat: 37.56, lon: 126.97 }, { lat: 37.57, lon: 127.01 }],
      profile: "road",
      avoidHighways: true,
    })).resolves.toEqual(result);
    expect(httpsCallable).toHaveBeenCalledWith(functions, COURSE_ROUTING_CALLABLE, { timeout: 30_000 });
  });

  it("preserves normalized server failure reasons", async () => {
    vi.mocked(httpsCallable).mockReturnValue(vi.fn(async () => {
      throw { details: { reason: "RATE_LIMITED" } };
    }) as never);
    await expect(requestCourseRoute(functions, {
      waypoints: [{ lat: 37.56, lon: 126.97 }], profile: "city", avoidHighways: false,
      targetDistanceM: 30_000, roundTripSeed: 42,
    })).rejects.toMatchObject({ reason: "RATE_LIMITED" });
  });

  it("rejects malformed geometry before rendering or export", () => {
    expect(() => validateCourseRoutingResult({ ...result, geometry: { ...result.geometry, coordinates: [[999, 37.56], [127, 37.57]] } }))
      .toThrow(CourseRoutingError);
    expect(() => validateCourseRoutingResult({ ...result, surfaceSummary: [{ surface: "paved", distanceM: -1 }] }))
      .toThrow(CourseRoutingError);
  });
});
