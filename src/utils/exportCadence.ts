import type { Activity, ActivityStreams } from "@shared/types";
import { activitySensorOrigin } from "../features/activity/detail/activitySensorOrigin";
import { isRawPartStreams } from "../services/activityStreamSource";
import type { ExportSport } from "./exportSport";

function footCadenceScale(activity: Activity, streams: ActivityStreams): number | undefined {
  if (activitySensorOrigin(activity) != null) return undefined;
  if (activity.source === "orider") return 0.5; // Native steps per minute count both feet.
  if (activity.source === "strava" && !isRawPartStreams(streams)) return 1; // Provider cadence counts strides.
  return undefined;
}

export function cadenceWriter(activity: Activity, streams: ActivityStreams, sport: ExportSport) {
  const scale = sport.footCadence ? footCadenceScale(activity, streams) : 1;
  const cyclesAt = (index: number) => {
    const value = streams.cadence?.[index];
    if (scale == null || typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
    const cycles = value * scale;
    return cycles < 255 ? cycles : undefined;
  };
  return {
    cyclesAt,
    available: scale != null && Array.isArray(streams.cadence)
      && streams.cadence.some((_, index) => cyclesAt(index) != null),
  };
}
