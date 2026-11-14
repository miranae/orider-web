/**
 * 클럽 이벤트·모임의 '다가오는' / '지난' 구간 — 서버 `listVisibleEventEnvelopes` 의 timeWindow
 * (orider-g1-web `functions/src/event/event-time-window.ts`)와 같은 규칙이다(#1620).
 *
 * 시작이 지났는데 OPEN 으로 남은 이벤트가 운영에 있다. 상태만 보면 '다가오는 이벤트'에 지난 일정이 섞인다.
 * 진행 중(LIVE)과 아직 시작 전 OPEN 은 다가오는 것, 종료·취소와 시작이 지난 OPEN 은 지난 것이다.
 */
export type ClubEventWindow = "upcoming" | "past";
/** 종료 시각이 없는 OPEN 은 시작 후 이만큼까지 다가오는 것으로 본다 — 늦게 출발하는 모임이 바로 사라지지 않게. */
export const OPEN_START_GRACE_MS = 3 * 60 * 60_000;

/** 이벤트가 속한 구간. DRAFT·알 수 없는 상태는 어디에도 보이지 않는다(null). 시작 시각을 모르는 OPEN 은 숨기지 않는다. */
export function clubEventWindow(status: string, startMs: number | null | undefined, nowMs: number, endMs?: number | null): ClubEventWindow | null {
  if (status === "LIVE") return "upcoming";
  if (status === "FINISHED" || status === "CANCELLED") return "past";
  if (status !== "OPEN") return null;
  if (typeof endMs === "number" && Number.isFinite(endMs) && endMs > 0) return endMs > nowMs ? "upcoming" : "past";
  if (!startMs || !Number.isFinite(startMs)) return "upcoming";
  return startMs + OPEN_START_GRACE_MS > nowMs ? "upcoming" : "past";
}

/** 구간 안 정렬 — 다가오는 것은 진행 중 먼저, 그다음 시작이 가까운 순. 지난 것은 최근 순. */
export function compareClubEvents(window: ClubEventWindow, a: { status: string; at: number; id: string }, b: { status: string; at: number; id: string }): number {
  if (window === "upcoming") {
    const live = Number(b.status === "LIVE") - Number(a.status === "LIVE");
    return live || a.at - b.at || a.id.localeCompare(b.id);
  }
  return b.at - a.at || a.id.localeCompare(b.id);
}

/** 서버 조회 옵션 — 새 서버는 timeWindow 로 거르고, 구간을 모르는 서버도 같은 상태·정렬로 읽게 statuses·descending 을 함께 보낸다. */
export function clubEventQuery(window: ClubEventWindow) {
  return window === "upcoming"
    ? { timeWindow: window, statuses: ["OPEN", "LIVE"], descending: false }
    : { timeWindow: window, statuses: ["OPEN", "FINISHED", "CANCELLED"], descending: true };
}
