import type { Activity, ActivityStreams } from "../../shared/types";
import { markRawPartStreams } from "../../src/services/activityStreamSource";

export const routeFixtureStart = 1791504000000;
const normal = [[37,127], [37.002,127.002], [37.004,127.004], [37.006,127.006], [37.008,127.008]];
export const routeFixtureActivity = { id: "synthetic-route-regression", userId: "synthetic", type: "Ride", source: "orider", startTime: routeFixtureStart,
  summary: { distance: 40, ridingTimeMillis: 4000, elapsedTimeMillis: 4000 } } as Activity;
export function routeFixtureStreams(kind = "sparse"): ActivityStreams {
  const latlng = kind === "normal" ? normal : kind === "missing" ? [null, {}, null, null, null]
    : [normal[0], normal[1], null, [37.02,127.02], [37.022,127.022]];
  return markRawPartStreams({ userId: "synthetic", time: [0,1,2,3,4],
    distance: [0,10,20,30,40], altitude: [1,2,3,4,5], watts: [100,null,120,130,140] as unknown as number[], latlng: latlng as [number,number][] }, "a".repeat(64));
}
