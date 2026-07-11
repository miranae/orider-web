/**
 * 첫 동기화 축하 판정 (설계 문서 §3.0.3, §3.4b 초기 이벤트).
 *
 * 이 이벤트는 **클라이언트가 발화**한다. 판정 근거가 "서버에 러닝 문서가 존재하는가"뿐이라
 * 조작할 인센티브도 가치도 없다(누적 거리·거리별 기록과 달리 순위에 쓰이지 않는다).
 * 덕분에 aha moment(§3.0)와 그 보상이 **같은 릴리스(R2)** 에 나갈 수 있다.
 * 조작 가능한 마일스톤·기록은 R3 에서 서버가 판정한다.
 *
 * ## 소급 축하 폭탄 방지
 * 기능 배포 시점에 이미 수백 번 달린 사용자에게 "첫 러닝을 축하합니다" 모달이 뜨면
 * 축하가 공허해진다. 첫 러닝이 **최근에 도착한 경우에만** 축하하고, 그 외에는 조용히
 * 달성 처리한다(모달 없이 플래그만 세움).
 */
import type { Activity } from "@shared/types";

/** 첫 러닝이 이 기간 안에 도착했으면 "방금 첫 동기화"로 본다. */
const RECENT_WINDOW_MS = 14 * 86400000;

export type FirstSyncDecision =
  | { action: "celebrate" }
  /** 조건은 충족했지만 소급분이라 모달 없이 플래그만 세운다. */
  | { action: "mark-silently"; reason: "backfill" }
  | { action: "none"; reason: "already-celebrated" | "no-runs" };

export function decideFirstSync(
  runs: Activity[],
  nowMs: number,
  alreadyMarked: boolean,
): FirstSyncDecision {
  if (alreadyMarked) return { action: "none", reason: "already-celebrated" };
  if (runs.length === 0) return { action: "none", reason: "no-runs" };

  const oldestRunMs = Math.min(...runs.map((a) => a.startTime));
  if (nowMs - oldestRunMs > RECENT_WINDOW_MS) {
    return { action: "mark-silently", reason: "backfill" };
  }
  return { action: "celebrate" };
}

/** uid 별 발화 락 키 — 기기 간 동기화는 하지 않는다(모달 1회 노출이 목적). */
export function firstSyncStorageKey(uid: string): string {
  return `orider.run.firstSync.${uid}`;
}
