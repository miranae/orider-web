import type { Activity } from "../types";

/** Server-owned display projection. Raw upload/provider summaries are retained separately. */
export interface ActivityPresentationV1 {
  version: 1;
  metricsVersion: number;
  computedAt: number;
  activityRevision: string | null;
  contentSelectedRevision: number | null;
  sensorOriginActivityId: string;
  summary: Partial<Activity["summary"]>;
  thumbnailTrack: string;
  mapImageUrl: string | null;
}

export function withActivityPresentation<T extends Activity>(activity: T): T {
  const p = activity.activityPresentationV1;
  if (p?.version !== 1 || p.activityRevision !== ((activity as Activity & { activityRevision?: string }).activityRevision ?? null)
    || p.contentSelectedRevision !== ((activity as Activity & { contentSelectedRevision?: number }).contentSelectedRevision ?? null)) return activity;
  return { ...activity, summary: { ...activity.summary, ...p.summary },
    thumbnailTrack: p.thumbnailTrack, mapImageUrl: p.mapImageUrl };
}
