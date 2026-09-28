import type { Activity } from "@shared/types";

type StravaActivityLike = Pick<Activity, "id"> & {
  source?: string;
  stravaActivityId?: number | string | null;
};

export function getStravaActivityId(activity: StravaActivityLike | null | undefined): number | null {
  if (!activity) return null;

  const rawId = activity.stravaActivityId;
  if (typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId > 0) return rawId;
  if (typeof rawId === "string" && /^\d+$/.test(rawId)) {
    const parsedId = Number(rawId);
    if (Number.isSafeInteger(parsedId) && parsedId > 0) return parsedId;
  }

  if (activity.source !== "strava") return null;
  const match = /^strava_(\d+)$/.exec(activity.id);
  if (!match) return null;
  const parsedId = Number(match[1]);
  return Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null;
}
