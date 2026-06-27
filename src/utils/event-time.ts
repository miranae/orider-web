/**
 * 이벤트 시각 정규화 유틸 — Firestore Timestamp / number / {_seconds} / {seconds} / {toMillis()}
 * 다양한 직렬화 포맷을 모두 ms 숫자로 변환.
 */
export function normalizeStartTime(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const o = v as { _seconds?: number; seconds?: number; toMillis?: () => number };
    if (typeof o.toMillis === "function") {
      try {
        return o.toMillis();
      } catch {
        // fall through
      }
    }
    if (typeof o._seconds === "number") return o._seconds * 1000;
    if (typeof o.seconds === "number") return o.seconds * 1000;
  }
  return 0;
}

/** YYYY-MM-DDTHH:MM 같은 datetime-local ISO 문자열을 ko-KR 표시용으로 변환 */
export function fmtIsoLocal(iso: string | undefined | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return iso;
  return new Date(ms).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 이벤트 closeAt이 현재 시각 이전이면 true */
export function isClosed(closeAtIso: string | undefined | null): boolean {
  if (!closeAtIso) return false;
  const ms = new Date(closeAtIso).getTime();
  return !isNaN(ms) && ms < Date.now();
}
