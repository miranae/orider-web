/**
 * 웹에서 메모를 직접 고칠 수 있는 활동 출처.
 * Strava 활동도 O-Rider 안에서 메모를 고친다 — Strava 로 되쓰지 않고, 서버가 사용자 메모를
 * Strava 설명보다 우선해 가져오기·수정 웹훅이 와도 덮이지 않는다(orider-g1-web authoredMemoOverride).
 */
export const MEMO_EDITABLE_SOURCES = ["orider", "strava"] as const;

export function canEditActivityMemo(source: unknown): boolean {
  return (MEMO_EDITABLE_SOURCES as readonly unknown[]).includes(source);
}
