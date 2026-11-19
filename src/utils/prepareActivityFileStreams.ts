import type { Activity, ActivityStreams } from "@shared/types";
import { activityIndependentRoute } from "../features/activity/detail/activityIndependentRoute";
import { readRawPartGridOrigin } from "../services/activityStreamSource";

/** Join independently timestamped observations at their actual times for FIT and TCX. */
export function prepareActivityFileStreams(activity: Activity, streams: ActivityStreams): ActivityStreams {
  const origin = readRawPartGridOrigin(streams);
  const time = streams.time;
  if (origin == null || !Number.isFinite(activity.startTime) || !time?.length
    || !time.every((sample, index) => sample === index)) return streams;

  const geometry = streams.activityRouteGeometryV1;
  const routeOrigin = geometry?.originEpochMs ?? (geometry?.timeOrigin === "activity_start" ? activity.startTime : null);
  const coordinates = routeOrigin !== null ? activityIndependentRoute(streams) : null;
  const sensorTimes = time.map(elapsed => Math.round(origin + elapsed * 1000));
  const routeTimes = routeOrigin !== null && coordinates && geometry
    ? geometry.time.map(elapsed => Math.round(routeOrigin + elapsed * 1000))
    : [];

  const timeline = [...new Set([...sensorTimes, ...routeTimes])].sort((a, b) => a - b);
  const slots = new Map(timeline.map((timestamp, index) => [timestamp, index]));
  function align<T>(values: readonly T[] | undefined, timestamps: readonly number[]): T[] | undefined {
    if (!values?.length) return values ? [] : undefined;
    const column = new Array<T>(timeline.length);
    timestamps.forEach((timestamp, index) => {
      const slot = slots.get(timestamp);
      const value = values[index];
      if (slot != null && value != null) column[slot] = value;
    });
    return column;
  }

  return {
    ...streams,
    time: timeline.map(timestamp => (timestamp - activity.startTime) / 1000),
    latlng: coordinates ? align(coordinates, routeTimes) : align(streams.latlng, sensorTimes),
    altitude: align(streams.altitude, sensorTimes),
    distance: align(streams.distance, sensorTimes),
    velocity_smooth: align(streams.velocity_smooth, sensorTimes),
    cadence: align(streams.cadence, sensorTimes),
    heartrate: align(streams.heartrate, sensorTimes),
    watts: align(streams.watts, sensorTimes),
  };
}
