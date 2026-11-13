import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { AthletePhoto } from "../components/athlete/AthletePhotoGallery";
import type { Activity } from "@shared/types";
export interface AthleteProfileTotals {
  integrityFailed?: true;
  schemaVersion: 1; ownerUid: string; epoch: string; state: "pending" | "ready" | "failed"; revision: number;
  count: number; distance: number; timeDisplayMillis: number; elevation: number;
  unknownDistanceCount: number; unknownTimeCount: number; unknownElevationCount: number;
}
export function parseAthleteProfile(value: unknown, uid: string): AthleteProfileTotals | null {
  if (!value || typeof value !== "object") return null;
  const v = value as AthleteProfileTotals;
  return v.schemaVersion === 1 && v.ownerUid === uid && typeof v.epoch === "string" && !!v.epoch
    && ["pending", "ready", "failed"].includes(v.state)
    && (v.integrityFailed === undefined || v.integrityFailed === true && v.state === "failed")
    && [v.count, v.unknownDistanceCount, v.unknownTimeCount, v.unknownElevationCount].every(n => Number.isSafeInteger(n) && n >= 0 && n <= v.count)
    && [v.distance, v.timeDisplayMillis, v.elevation].every(Number.isFinite)
    && Number.isSafeInteger(v.revision) && v.revision >= 0 ? v : null;
}
export async function callAthleteProfile<T>(services: FirebaseServices, uid: string, name: string, data: unknown, current: () => boolean): Promise<T> {
  const owner = services.auth.currentUser;
  let expired = false, timer: ReturnType<typeof setTimeout> | undefined;
  const valid = () => !expired && current() && services.auth.currentUser === owner && owner?.uid === uid;
  try {
    return await Promise.race([
      (async () => {
        if (!valid()) throw new Error("athlete-profile-session-changed");
        await services.ensureAppCheckReady();
        if (!valid()) throw new Error("athlete-profile-session-changed");
        const response = await httpsCallable<unknown, T>(services.functions, name)(data);
        if (!valid()) throw new Error("athlete-profile-session-changed");
        return response.data;
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error("athlete-profile-timeout")); }, 12000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
export interface AthletePreviewCursor { epoch: string; order: "recent" | "all"; startTime: number | null; id: string }
export type AthleteHighlight = NonNullable<Activity["topAchievements"]>[number] & { activityId: string };
export interface AthletePreview<T> { items: T[]; scope: "recent" | "all"; complete: boolean; pendingCount: number; coverageComplete: boolean; retryCursor: AthletePreviewCursor | null; nextCursor: AthletePreviewCursor | null }
export type AthletePhotoPreview = AthletePreview<AthletePhoto>;

/** Firestore 경로 요소 순서는 UTF-8 기준이며 UTF-16 문자열 비교와 다를 수 있다. */
export function compareAthleteDocumentIds(a: string, b: string) {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return left.length - right.length;
}

const validDocumentId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value !== "." && value !== ".." && !value.includes("/") && new TextEncoder().encode(value).length <= 1500;

/** 원본 6/12개 활동 페이지를 검사하며 표시 항목이 없어도 다음 커서를 보존한다. */
export async function loadAthleteProfilePreview<T extends AthletePhoto | AthleteHighlight>(services: FirebaseServices, uid: string,
  kind: "photos" | "highlights", epoch: string, cursor: AthletePreviewCursor | null, all: boolean, current: () => boolean): Promise<AthletePreview<T>> {
  const scope = all ? "all" : "recent";
  if (cursor && (cursor.epoch !== epoch || cursor.order !== scope || !validDocumentId(cursor.id))) throw new Error("athlete-preview-invalid-cursor");
  const page = await callAthleteProfile<AthletePreview<T>>(services, uid, "getAthleteProfilePreview", { kind, ...(cursor ? { cursor } : {}), ...(all ? { all: true } : {}) }, current);
  const next = page?.nextCursor;
  const sameCursor = (a: AthletePreviewCursor | null, b: AthletePreviewCursor | null) => a === null ? b === null : a != null && b !== null && a.epoch === b.epoch && a.order === b.order && a.id === b.id && a.startTime === b.startTime;
  if (!page || page.scope !== scope || typeof page.complete !== "boolean"
    || !Number.isSafeInteger(page.pendingCount) || page.pendingCount < 0 || page.pendingCount > (kind === "photos" ? 0 : 12)
    || page.coverageComplete !== (page.pendingCount === 0)
    || !sameCursor(page.retryCursor, page.pendingCount > 0 ? cursor : null) || !Array.isArray(page.items) || page.items.length > (kind === "photos" ? 30 : 36)
    || (page.complete ? next !== null : !next || next.epoch !== epoch || next.order !== scope || !validDocumentId(next.id)
      || (all ? next.startTime !== null : typeof next.startTime !== "number" || !Number.isFinite(next.startTime))
      || cursor && (all ? compareAthleteDocumentIds(next.id, cursor.id) <= 0 : next.startTime! > cursor.startTime! || next.startTime === cursor.startTime && compareAthleteDocumentIds(next.id, cursor.id) >= 0))) throw new Error("athlete-preview-invalid-page");
  for (const item of page.items) {
    if (!item || !validDocumentId(item.activityId)) throw new Error("athlete-preview-invalid-item");
    if (kind === "photos") {
      const photo = item as AthletePhoto;
      if (typeof photo.id !== "string" || !photo.id || typeof photo.url !== "string" || photo.caption !== null && typeof photo.caption !== "string") throw new Error("athlete-preview-invalid-item");
    } else {
      const highlight = item as AthleteHighlight;
      if (!["KOM", "PR", "2nd", "3rd"].includes(highlight.type) || typeof highlight.segmentId !== "string" || typeof highlight.segmentName !== "string" || typeof highlight.time !== "string") throw new Error("athlete-preview-invalid-item");
    }
  }
  return page;
}
