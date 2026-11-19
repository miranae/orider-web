import type { Activity, ActivityStreams } from "@shared/types";
import { activityIndependentRoute } from "../features/activity/detail/activityIndependentRoute";
import { markStreamCadenceUnit, readRawPartGridOrigin, readStreamCadenceUnit, readVerifiedStreamRevision } from "../services/activityStreamSource";
import { makeRelSecAt } from "./streamTime";
import { detectTimestampUnit } from "./timestampUnit";

const timedFileStreams = Symbol("timedFileStreams");
type TimedFileStreams = ActivityStreams & { [timedFileStreams]: true };

function timestampsOf(activity: Activity, streams: ActivityStreams): Array<number | null> {
  const first = streams.time?.find(value => Number.isFinite(value));
  const unit = first == null ? "relative_sec" : detectTimestampUnit(first);
  const relative = makeRelSecAt(streams.time);
  return Array.from({ length: streams.time?.length || streams.latlng?.length || 0 }, (_, index) => {
    const sample = streams.time?.[index];
    if (streams.time?.length && (sample == null || !Number.isFinite(sample))) return null;
    if (sample != null && Number.isFinite(activity.startTime)) {
      if (unit === "epoch_ms") return Math.round(sample - activity.startTime);
      if (unit === "epoch_sec") return Math.round(sample * 1000 - activity.startTime);
    }
    return Math.round((relative(index) ?? index) * 1000);
  });
}

function combineTimedStreams(
  base: ActivityStreams,
  baseTimes: Array<number | null>,
  secondary: ActivityStreams,
  secondaryTimes: Array<number | null>,
): TimedFileStreams {
  const timeline = [...new Set([...baseTimes, ...secondaryTimes])].filter((time): time is number => time !== null).sort((a, b) => a - b);
  const slots = new Map(timeline.map((timestamp, index) => [timestamp, index]));
  function align<T>(original: readonly T[] | undefined, additions: readonly T[] | undefined): T[] | undefined {
    if (!original?.length && !additions?.length) return undefined;
    const column = new Array<T>(timeline.length);
    const write = (values: readonly T[] | undefined, timestamps: Array<number | null>) => {
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
    cadence: align(base.cadence, secondary.cadence),
    heartrate: align(base.heartrate, secondary.heartrate),
    watts: align(base.watts, secondary.watts),
  };
}

/** Keep independently observed GPS timestamps rather than assigning them to sensor rows. */
export function usesVerifiedActivityTime(streams: ActivityStreams): boolean {
  return (streams as Partial<TimedFileStreams>)[timedFileStreams] === true;
}

function alignRawPartTimeline(activity: Activity, streams: ActivityStreams): ActivityStreams {
  const origin = readRawPartGridOrigin(streams);
  const time = streams.time;
  if (usesVerifiedActivityTime(streams) || origin == null || !Number.isFinite(activity.startTime)
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
  const baseRevision = readVerifiedStreamRevision(displayed);
  const revision = readVerifiedStreamRevision(verified);
  const unit = readStreamCadenceUnit(verified);
  if (baseRevision && baseRevision !== revision) return displayed;

  const baseTimes = timestampsOf(activity, base);
  const candidateTimes = timestampsOf(activity, cadenceSource);
  const measuredPairs = (values: ActivityStreams["cadence"], timestamps: Array<number | null>) =>
    timestamps.flatMap((time, index): Array<[number, number]> => {
      const value = values?.[index];
      return time !== null && typeof value === "number" && Number.isFinite(value) && value >= 0 ? [[time, value]] : [];
    });
  const confirmed = measuredPairs(cadenceSource.cadence, candidateTimes);
  if (!confirmed.length) return displayed;

  if (!baseRevision) {
    // Legacy display streams have no revision. Bind a unit only to identical measured pairs.
    const original = measuredPairs(base.cadence, baseTimes);
    const originalCount = displayed.cadence?.filter(value => Number.isFinite(value) && value >= 0).length ?? 0;
    if (original.length !== originalCount || original.length !== confirmed.length
      || original.some(([time, cadence], index) => time !== confirmed[index]?.[0] || cadence !== confirmed[index]?.[1])) return displayed;
    return markStreamCadenceUnit(displayed, unit);
  }

  const existingCadence = base.cadence?.map(value => Number.isFinite(value) && value >= 0 ? value : undefined);
  const combined = combineTimedStreams({ ...base, cadence: existingCadence as ActivityStreams["cadence"] }, baseTimes,
    { userId: displayed.userId, cadence: confirmed.map(([, value]) => value) }, confirmed.map(([time]) => time));
  return markStreamCadenceUnit(combined, unit);
}

export function prepareActivityFileStreams(activity: Activity, streams: ActivityStreams, format: "fit" | "tcx"): ActivityStreams {
  const timed = alignRawPartTimeline(activity, streams);
  if (format !== "fit" || !usesVerifiedActivityTime(timed)) return timed;
  // FIT timestamps are integer seconds. At each second keep the last observed value per channel.
  const fitTimes = timestampsOf(activity, timed).map(timestamp => timestamp === null ? null : Math.round(timestamp / 1000) * 1000);
  return combineTimedStreams(timed, fitTimes, { userId: timed.userId }, []);
}
