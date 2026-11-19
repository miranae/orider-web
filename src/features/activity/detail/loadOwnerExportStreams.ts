import type { Activity, ActivityStreams } from "@shared/types";
import type { FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { readStreamCadenceUnit } from "../../../services/activityStreamSource";
import { logClientError, debugLog, reportPreviousAccountFailure } from "../../../services/errorLogger";
import { createPublicActivityClient, isPublicActivityAccessError } from "../../../services/publicActivityDetail";
import { getRuntimeConfig } from "../../../services/runtimeConfig";
import { applyVerifiedCadenceUnit } from "../../../utils/prepareActivityFileStreams";
import { exportSportOf } from "../../../utils/exportSport";
import { activitySensorOrigin } from "./activitySensorOrigin";
import { usesCanonicalActivityStreams } from "./useActivityStreamsLoader";

function hasFootCadenceUnit(streams: ActivityStreams): boolean {
  const unit = readStreamCadenceUnit(streams);
  return unit === "spm" || unit === "strides_per_minute";
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
    || !Array.isArray(displayed.cadence) || !displayed.cadence.some(value => Number.isFinite(value) && value >= 0)
    || hasFootCadenceUnit(displayed)
    || (!usesCanonicalActivityStreams(activity.id, activity.source) && !activitySensorOrigin(activity))) return displayed;

  const context = { activityId: activity.id, source: activity.source ?? "unknown", format };
  const result = await createPublicActivityClient(services).streams(activity.id).catch(error => {
    if (services.auth.currentUser !== account) {
      reportPreviousAccountFailure("ActivityStreams.ownerExportPreviousAccount", error, { format, source: context.source });
      throw new Error("account_changed");
    }
    logClientError("ActivityStreams.ownerExport", error, context, services);
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    // Firebase assigns this default message to a bare HTTP 404.
    const endpointMissing = error instanceof Error && code === "functions/not-found" && error.message === "not-found";
    if ((isPublicActivityAccessError(error) && !endpointMissing) || code === "functions/unauthenticated"
      || (error instanceof Error && ["account_changed", "activity_stream_identity_mismatch"].includes(error.message))) throw error;
    return null;
  });
  if (services.auth.currentUser !== account) throw new Error("account_changed");
  if (!result) return displayed;
  if (result.activityId !== activity.id) throw new Error("STREAMS_MISSING");
  if (result.state === "pending" || result.state === "unavailable" || result.state === "changed_input") {
    debugLog("streams.owner_export_fallback", { ...context, state: result.state, reason: result.reason });
    return displayed;
  }
  if (result.state !== "available" || !result.streams) throw new Error("STREAMS_MISSING");
  const { cadence, time } = result.streams;
  if (!hasFootCadenceUnit(result.streams) || !Array.isArray(cadence) || !Array.isArray(time)
    || !cadence.some((value, index) => Number.isFinite(value) && value >= 0 && Number.isFinite(time[index]))) {
    return displayed;
  }
  return applyVerifiedCadenceUnit(activity, displayed, result.streams);
}
