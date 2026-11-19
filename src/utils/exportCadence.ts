import type { Activity, ActivityStreams } from "@shared/types";
import { activitySensorOrigin } from "../features/activity/detail/activitySensorOrigin";
import { isRawPartStreams, readStreamCadenceUnit } from "../services/activityStreamSource";
import type { ExportSport } from "./exportSport";
import { getStravaActivityId } from "./stravaActivity";

function footCadenceScale(activity: Activity, streams: ActivityStreams): number | undefined {
  const unit = readStreamCadenceUnit(streams);
  if (unit === "spm") return 0.5;
  if (unit === "strides_per_minute") return 1;
  if (unit === null) return undefined;

  const origin = activitySensorOrigin(activity);
  if (origin != null && origin !== activity.id) return undefined;
  const legacyNative = activity.source == null && activity.id?.startsWith("orider_");
  if (activity.source === "orider" || legacyNative) return 0.5;
  const legacyProvider = activity.source == null && getStravaActivityId(activity) != null;
  if ((activity.source === "strava" || legacyProvider) && !isRawPartStreams(streams)) return 1;
  return undefined;
}

export function needsExportCadenceUnit(activity: Activity, streams: ActivityStreams, sport: ExportSport): boolean {
  return sport.footCadence && footCadenceScale(activity, streams) == null
    && Array.isArray(streams.cadence)
    && streams.cadence.some(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 510);
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
