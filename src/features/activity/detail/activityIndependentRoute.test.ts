import { describe, expect, it } from "vitest";
import type { ActivityStreams } from "@shared/types";
import { activityIndependentRoute } from "./activityIndependentRoute";
const geometry = { version: 1 as const, timingBasis: "elapsed" as const, timeOrigin: "activity_start" as const,
  originEpochMs: 1700000000000, routeInputRevision: "a".repeat(64), time: [0, 600], latlng: [[37, 127], [38, 128]] as [number, number][] };
describe("independent activity route", () => {
  it("accepts its own time axis independently of sensor sample count", () => {
    expect(activityIndependentRoute({ time: [0, 1, 2], activityRouteGeometryV1: geometry } as ActivityStreams)).toEqual(geometry.latlng);
  });
  it.each([{ time: [0, 0] }, { time: [0] }, { latlng: [[91, 127], [38, 128]] }, { routeInputRevision: "bad" }, { originEpochMs: NaN }])("rejects invalid geometry %j", patch => {
    expect(activityIndependentRoute({ activityRouteGeometryV1: { ...geometry, ...patch } } as ActivityStreams)).toBeNull();
  });
});
