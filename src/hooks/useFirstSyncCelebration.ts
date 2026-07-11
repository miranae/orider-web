/**
 * 첫 동기화 축하 발화 제어 (설계 문서 §3.4b 초기 이벤트).
 *
 * 판정은 순수 함수(`utils/firstSync.ts`)가 하고, 이 훅은 부작용만 담당한다:
 * localStorage 락, 분석 이벤트, 모달 상태.
 *
 * 이 이벤트만 **localStorage** 로 락을 건다. 서버에 쓸 값이 없기 때문이다(축하 1회 노출이 목적).
 * 조작 가능한 마일스톤·거리별 기록은 서버가 판정하며 `users/{uid}/milestones` 를 쓴다 —
 * 해당 rules 는 orider-g1-web 에서 이미 배포됐다(read 는 본인, 클라 write 는 `celebrated` 필드만).
 * 즉 "rules 가 없다"는 R2 시점의 제약은 해소됐고, 이 훅이 localStorage 를 쓰는 이유는 서버
 * 판정이 불가능해서가 아니라 **판정 근거가 조작할 가치가 없어서**다.
 */
import { useEffect, useState } from "react";
import type { Activity } from "@shared/types";
import { decideFirstSync, firstSyncStorageKey } from "../utils/firstSync";
import { logClientError, debugLog } from "../services/errorLogger";
import { track } from "../services/analytics";

function readMarked(key: string): boolean {
  try {
    return localStorage.getItem(key) != null;
  } catch (err) {
    logClientError("useFirstSyncCelebration.read", err, { key });
    return true; // 읽을 수 없으면 축하하지 않는다 — 매 방문마다 모달이 뜨는 편이 더 나쁘다
  }
}

function writeMarked(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    logClientError("useFirstSyncCelebration.write", err, { key });
  }
}

export interface FirstSyncCelebrationState {
  /** 모달을 띄울지. */
  show: boolean;
  /** 축하 대상 활동(가장 최근 러닝) id. */
  activityId: string | null;
  dismiss: () => void;
}

/**
 * @param historyWindowMs `runs` 를 만든 조회 창 — 창이 계정 수명보다 짧으면 첫 러닝임을
 *   증명할 수 없다(복귀 러너 오발화 방지). `firstSync.decideFirstSync` 참고.
 * @param accountCreatedMs 계정 생성 시각(`profile.createdAt`). 모르면 축하하지 않는다.
 */
export function useFirstSyncCelebration(
  runs: Activity[],
  loading: boolean,
  uid: string | null,
  historyWindowMs: number,
  accountCreatedMs: number | null | undefined,
): FirstSyncCelebrationState {
  const [show, setShow] = useState(false);
  const [activityId, setActivityId] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !uid) return;
    const key = firstSyncStorageKey(uid);
    const decision = decideFirstSync(runs, Date.now(), readMarked(key), {
      historyWindowMs,
      accountCreatedMs,
    });

    debugLog("firstSync.decision", {
      action: decision.action,
      reason: "reason" in decision ? decision.reason : null,
      runs: runs.length,
    });

    if (decision.action === "celebrate") {
      const newest = runs.reduce((a, b) => (b.startTime > a.startTime ? b : a));
      writeMarked(key, String(Date.now()));
      setActivityId(newest.id);
      setShow(true);
      track("or_first_sync_celebrated", { runCount: runs.length });
    } else if (decision.action === "mark-silently") {
      // 소급분·증명 불가: 모달 없이 달성 처리만 — 다음 방문에도 뜨지 않는다.
      writeMarked(key, decision.reason);
      track("or_first_sync_backfilled", { runCount: runs.length, reason: decision.reason });
    }
  }, [runs, loading, uid, historyWindowMs, accountCreatedMs]);

  return { show, activityId, dismiss: () => setShow(false) };
}
