import type { Activity } from "@shared/types";

/** Only the current server-owned presentation may select another recording's sensors. */
export function activitySensorOrigin(activity: Activity | null): string | null {
  const p = activity?.activityPresentationV1;
  const revision = (activity as (Activity & { activityRevision?: unknown }) | null)?.activityRevision ?? null;
  return p?.version === 1 && p.activityRevision === revision
    && p.contentSelectedRevision === (activity?.contentSelectedRevision ?? null)
    && typeof p.sensorOriginActivityId === "string" ? p.sensorOriginActivityId : null;
}
