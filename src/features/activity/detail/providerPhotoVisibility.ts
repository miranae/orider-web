import type { OverviewPhoto } from "./ActivityOverviewSocial";

/** Strava 사진 id 형식(서버 계약과 같다). */
const PROVIDER_PHOTO_ID = /^[A-Za-z0-9_-]{1,160}$/;

/**
 * 주인이 숨긴 Strava 사진 id. 서버가 주인 uid 를 찍어 둔 v1 값만 인정한다.
 * 숨김은 O-Rider 화면에서만 가리는 것이고 Strava 원본은 지우지 않는다.
 */
export function hiddenProviderPhotoIds(activity: { userId?: string; hiddenProviderPhotosV1?: unknown }): string[] {
  const value = activity.hiddenProviderPhotosV1 as { version?: unknown; userId?: unknown; ids?: unknown } | undefined;
  if (!value || value.version !== 1 || value.userId !== activity.userId || !Array.isArray(value.ids)) return [];
  return value.ids.filter((id): id is string => typeof id === "string" && PROVIDER_PHOTO_ID.test(id));
}

/** 개요 사진이 Strava 에서 가져온 사진이면 Strava 사진 id 를, 아니면 null. */
export function providerPhotoIdOf(photo: Pick<OverviewPhoto, "id" | "nativePhoto" | "uploadId">): string | null {
  if (photo.nativePhoto || photo.uploadId || !photo.id.startsWith("strava-")) return null;
  const id = photo.id.slice("strava-".length);
  return PROVIDER_PHOTO_ID.test(id) ? id : null;
}

export function withoutHiddenProviderPhotos<T extends Pick<OverviewPhoto, "id" | "nativePhoto" | "uploadId">>(photos: T[], hidden: readonly string[]): T[] {
  if (!hidden.length) return photos;
  const set = new Set(hidden);
  return photos.filter(photo => { const id = providerPhotoIdOf(photo); return id == null || !set.has(id); });
}

/**
 * Strava 활동 개요의 사진 총수. Strava 사진(숨긴 것 제외) + O-Rider 로 올린 사진.
 * 올린 사진 목록을 아직 못 읽었으면(공개 열람 등) 서버가 합쳐 둔 피드 본문 총수를 쓴다.
 */
export function stravaOverviewPhotoTotal(input: { overviewCount: number; streamPhotoIds: string[]; stravaPhotoCount?: number | null;
  hiddenIds: readonly string[]; uploadedCount: number | null; publishedTotal?: number | null }): number {
  const hidden = new Set(input.hiddenIds);
  const visibleStream = input.streamPhotoIds.filter(id => !hidden.has(id)).length;
  const strava = Math.max(visibleStream, Math.max(0, (input.stravaPhotoCount ?? 0) - hidden.size));
  // 서버가 합친 피드 총수(올린 사진 + 숨기지 않은 Strava 사진)는 하한으로 쓴다 — 활동 문서의 Strava
  // 사진 수가 비어 있어도 총수가 줄지 않고, 올린 사진을 두 번 더하지도 않는다.
  const total = input.uploadedCount == null ? input.publishedTotal ?? strava
    : Math.max(input.publishedTotal ?? 0, strava + input.uploadedCount);
  return Math.max(input.overviewCount, total);
}

export interface ProviderHiddenOverride { activityId: string; uid: string | undefined; base: string; ids: string[] }
/**
 * 저장 직후 서버 응답(override)을 쓸지, 활동 문서 목록을 쓸지 정한다. override 는 같은 활동·같은 계정이고
 * 문서 목록이 저장 당시(base) 그대로일 때만 쓴다 — 문서가 바뀌면(이 저장 반영·다른 탭·기기 변경) 문서를 따른다.
 */
export function effectiveHiddenProviderIds(documentIds: string[], override: ProviderHiddenOverride | null, activityId: string, uid: string | undefined): string[] {
  return override && override.activityId === activityId && override.uid === uid && override.base === JSON.stringify(documentIds)
    ? override.ids : documentIds;
}

/** 지도·스트림용 Strava 사진에서도 숨긴 사진을 뺀다(개요 갤러리와 같은 기준). */
export function withoutHiddenStreamPhotos<T extends { id?: unknown }>(photos: T[], hidden: readonly string[]): T[] {
  if (!hidden.length) return photos;
  const set = new Set(hidden);
  return photos.filter(photo => !set.has(String(photo.id)));
}
