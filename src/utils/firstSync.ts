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
 *
 * ## 이력 창이 잘린 경우 (중요)
 * 입력 `runs` 는 전체 이력이 아니라 `useRunHistory(weeks)` 의 **창으로 잘린** 배열이다.
 * 따라서 "창 안의 가장 오래된 러닝이 최근이다"는 "첫 러닝이다"를 의미하지 않는다 —
 * 오래 쉬었다가 다시 달린 복귀 러너도 창 안에는 최근 러닝 하나만 보인다.
 * 창이 계정 전체 수명을 덮지 못하면 **첫 러닝임을 증명할 수 없으므로 축하하지 않는다**.
 * 놓친 축하보다 틀린 축하가 비싸다. 계정이 창보다 어릴 때만 창 = 전체 이력이 보장된다.
 */
import type { Activity } from "@shared/types";

/** 첫 러닝이 이 기간 안에 도착했으면 "방금 첫 동기화"로 본다. */
const RECENT_WINDOW_MS = 14 * 86400000;

export interface FirstSyncInputs {
  /** `runs` 를 만든 이력 조회 창 길이 (ms). 이보다 오래된 러닝은 애초에 배열에 없다. */
  historyWindowMs: number;
  /**
   * 계정 생성 시각. **아직 로딩 중이면 null 이 들어온다** — 프로필 스냅샷은 활동 쿼리와
   * 별개로 도착하기 때문. 그래서 null 은 "오래된 계정"이 아니라 "모름"으로 다뤄야 한다.
   * 모를 때 플래그를 세워버리면 프로필이 늦게 도착한 신규 사용자가 축하를 영구히 잃는다.
   */
  accountCreatedMs: number | null | undefined;
}

export type FirstSyncDecision =
  | { action: "celebrate" }
  /** 조건은 충족했지만 첫 러닝임을 증명할 수 없어 모달 없이 플래그만 세운다. */
  | { action: "mark-silently"; reason: "backfill" | "history-truncated" }
  /** 아직 판단할 수 없다 — 플래그도 세우지 않는다(다음 렌더에서 다시 판정). */
  | { action: "none"; reason: "already-celebrated" | "no-runs" | "profile-unknown" };

export function decideFirstSync(
  runs: Activity[],
  nowMs: number,
  alreadyMarked: boolean,
  inputs: FirstSyncInputs,
): FirstSyncDecision {
  if (alreadyMarked) return { action: "none", reason: "already-celebrated" };
  if (runs.length === 0) return { action: "none", reason: "no-runs" };

  // 계정 생성일을 모르면 아무것도 하지 않는다 — 로딩 중일 수 있으므로 락을 세우면 안 된다.
  if (inputs.accountCreatedMs == null) return { action: "none", reason: "profile-unknown" };

  // 창이 계정 수명을 못 덮으면 창 밖에 과거 러닝이 있을 수 있다 → 첫 러닝이라 단정 못 한다.
  if (nowMs - inputs.accountCreatedMs > inputs.historyWindowMs) {
    return { action: "mark-silently", reason: "history-truncated" };
  }

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
