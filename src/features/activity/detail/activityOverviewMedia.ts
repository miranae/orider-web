import type { ActivityFeedContentProjection } from "@shared/types/activity-feed-content";
import type { PhotoData } from "./activityDetailDerived";
import type { OverviewPhoto } from "./ActivityOverviewSocial";

/** Stream photos may contain only posters; keep the authorized projection's video metadata. */
export function activityOverviewMedia(photos: PhotoData[], published: ActivityFeedContentProjection["photos"] = []): OverviewPhoto[] {
  const byId = new Map(published.map(item => [String(item.id), item]));
  const items = photos.filter(photo => photo.url).map(photo => {
    const media = byId.get(String(photo.id));
    return { ...photo, ...(media ? { kind: media.kind, videoUrl: media.videoUrl, durationSeconds: media.durationSeconds } : {}), url: photo.url!, id: `strava-${photo.id}` };
  });
  const loadedIds = new Set(photos.filter(photo => photo.url).map(photo => String(photo.id)));
  return [...items, ...published.filter(item => !loadedIds.has(String(item.id))).map(item => ({ ...item, id: `strava-${item.id}` }))];
}
