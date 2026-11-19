import type { Activity, ActivityStreams } from "@shared/types";
import type { FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { readStreamCadenceUnit } from "../../../services/activityStreamSource";
import { logClientError, debugLog } from "../../../services/errorLogger";
import { createPublicActivityClient, isPublicActivityAccessError } from "../../../services/publicActivityDetail";
import { getRuntimeConfig } from "../../../services/runtimeConfig";
import { exportSportOf } from "../../../utils/exportSport";
import { activityIndependentRoute } from "./activityIndependentRoute";
import { activitySensorOrigin } from "./activitySensorOrigin";
import { usesCanonicalActivityStreams } from "./useActivityStreamsLoader";

function hasFootCadenceUnit(streams: ActivityStreams): boolean {
  const unit = readStreamCadenceUnit(streams);
  return unit === "spm" || unit === "strides_per_minute";
}

function withObservedCoordinates(streams: ActivityStreams, gridOrigin: number | undefined): ActivityStreams {
  if (streams.latlng?.length || typeof gridOrigin !== "number" || !Number.isFinite(gridOrigin)) return streams;
  const geometry = streams.activityRouteGeometryV1;
  const coordinates = activityIndependentRoute(streams);
  const time = streams.time;
  const routeOrigin = geometry?.originEpochMs;
  if (!coordinates || !geometry || routeOrigin == null || !time?.length
    || !time.every((sample, index) => sample === index)) return streams;

  const aligned = new Array<[number, number]>(time.length);
  geometry.time.forEach((elapsed, index) => {
    const point = coordinates[index];
    const slot = Math.floor((routeOrigin + elapsed * 1000 - gridOrigin) / 1000);
    if (point && slot >= 0 && slot < time.length) aligned[slot] = point;
  });
  return aligned.some(Boolean) ? { ...streams, latlng: aligned } : streams;
}

export async function loadOwnerExportStreams(
  activity: Activity,
  displayed: ActivityStreams,
  format: string,
  services: FirebaseServices,
): Promise<ActivityStreams> {
  const account = services.auth.currentUser;
  const config = getRuntimeConfig();
  if ((format !== "fit" && format !== "tcx") || !account || account.isAnonymous || account.uid !== activity.userId
    || config.appEnvironment === "stage" || config.publicActivityDetailEnabled !== true || !exportSportOf(activity).footCadence
    || hasFootCadenceUnit(displayed)
    || (!usesCanonicalActivityStreams(activity.id, activity.source) && !activitySensorOrigin(activity))) return displayed;

  const context = { activityId: activity.id, source: activity.source ?? "unknown", format };
  const result = await createPublicActivityClient(services).streams(activity.id).catch(error => {
    logClientError("ActivityStreams.ownerExport", error, context, services);
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    // Firebase assigns this default message to a bare HTTP 404.
    const endpointMissing = error instanceof Error && code === "functions/not-found" && error.message === "not-found";
    if ((isPublicActivityAccessError(error) && !endpointMissing) || code === "functions/unauthenticated"
      || (error instanceof Error && ["account_changed", "invalid_activity_streams"].includes(error.message))) throw error;
    return null;
  });
  if (services.auth.currentUser !== account) throw new Error("account_changed");
  if (!result) return displayed;
  if (result.activityId !== activity.id || result.state === "changed_input") throw new Error("STREAMS_MISSING");
  if (result.state === "pending" || result.state === "unavailable") {
    debugLog("streams.owner_export_fallback", { ...context, state: result.state, reason: result.reason });
    return displayed;
  }
  if (result.state !== "available" || !result.streams) throw new Error("STREAMS_MISSING");
  if (!hasFootCadenceUnit(result.streams)) return displayed;
  return result.sourceLayer === "raw_parts" ? withObservedCoordinates(result.streams, result.routeTimeOriginEpochMs) : result.streams;
}
