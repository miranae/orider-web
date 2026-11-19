import type { Activity, ActivityStreams } from "@shared/types";
import { activityIndependentRoute } from "../features/activity/detail/activityIndependentRoute";
import { markStreamCadenceUnit, readRawPartGridOrigin, readStreamCadenceUnit } from "../services/activityStreamSource";
import { makeRelSecAt } from "./streamTime";

const timedFileStreams = Symbol("timedFileStreams");
type TimedFileStreams = ActivityStreams & { [timedFileStreams]: true };

function timestampsOf(streams: ActivityStreams): number[] {
  const relative = makeRelSecAt(streams.time);
  return Array.from({ length: streams.time?.length || streams.latlng?.length || 0 },
    (_, index) => Math.round((relative(index) ?? index) * 1000));
}

function combineTimedStreams(
  base: ActivityStreams,
  baseTimes: number[],
  secondary: ActivityStreams,
  secondaryTimes: number[],
  useSecondaryCadence = false,
): TimedFileStreams {
  const timeline = [...new Set([...baseTimes, ...secondaryTimes])].sort((a, b) => a - b);
  const slots = new Map(timeline.map((timestamp, index) => [timestamp, index]));
  function align<T>(original: readonly T[] | undefined, additions: readonly T[] | undefined): T[] | undefined {
    if (!original?.length && !additions?.length) return undefined;
    const column = new Array<T>(timeline.length);
    const write = (values: readonly T[] | undefined, timestamps: number[]) => {
      values?.forEach((value, index) => {
        const timestamp = timestamps[index];
        const slot = timestamp == null ? undefined : slots.get(timestamp);
        if (slot != null && value != null) column[slot] = value;
      });
    };
    write(additions, secondaryTimes);
    write(original, baseTimes);
    return column;
  }

  return {
    ...base,
    [timedFileStreams]: true,
    time: timeline.map(timestamp => timestamp / 1000),
    latlng: align(base.latlng, secondary.latlng),
    altitude: align(base.altitude, secondary.altitude),
    distance: align(base.distance, secondary.distance),
    velocity_smooth: align(base.velocity_smooth, secondary.velocity_smooth),
    cadence: useSecondaryCadence ? align(undefined, secondary.cadence) : align(base.cadence, secondary.cadence),
    heartrate: align(base.heartrate, secondary.heartrate),
    watts: align(base.watts, secondary.watts),
  };
}

/** Keep independently observed GPS timestamps rather than assigning them to sensor rows. */
function alignRawPartTimeline(activity: Activity, streams: ActivityStreams): ActivityStreams {
  const origin = readRawPartGridOrigin(streams);
  const time = streams.time;
  if ((streams as Partial<TimedFileStreams>)[timedFileStreams] || origin == null || !Number.isFinite(activity.startTime)
    || !time?.length || !time.every((sample, index) => sample === index)) return streams;

  const geometry = streams.activityRouteGeometryV1;
  const routeOrigin = geometry?.originEpochMs ?? (geometry?.timeOrigin === "activity_start" ? activity.startTime : null);
  const coordinates = routeOrigin !== null ? activityIndependentRoute(streams) : null;
  const sensorTimes = time.map(elapsed => Math.round(origin - activity.startTime + elapsed * 1000));
  if (!coordinates || !geometry || routeOrigin == null) return combineTimedStreams(streams, sensorTimes, { userId: streams.userId }, []);
  const routeTimes = geometry.time.map(elapsed => Math.round(routeOrigin - activity.startTime + elapsed * 1000));
  return combineTimedStreams({ ...streams, latlng: undefined }, sensorTimes, { userId: streams.userId, latlng: coordinates }, routeTimes);
}

export function addVerifiedCadenceToExport(activity: Activity, displayed: ActivityStreams, verified: ActivityStreams): ActivityStreams {
  const base = alignRawPartTimeline(activity, displayed);
  const cadenceSource = alignRawPartTimeline(activity, verified);
  const combined = combineTimedStreams(base, timestampsOf(base), cadenceSource, timestampsOf(cadenceSource), true);
  return markStreamCadenceUnit(combined, readStreamCadenceUnit(verified));
}

export function prepareActivityFileStreams(activity: Activity, streams: ActivityStreams, format: "fit" | "tcx"): ActivityStreams {
  const timed = alignRawPartTimeline(activity, streams);
  if (format !== "fit" || !(timed as Partial<TimedFileStreams>)[timedFileStreams]) return timed;
  // FIT timestamps are integer seconds. At each second keep the last observed value per channel.
  const fitTimes = timestampsOf(timed).map(timestamp => Math.round(timestamp / 1000) * 1000);
  return combineTimedStreams(timed, fitTimes, { userId: timed.userId }, []);
}
