/**
 * 첫 동기화 축하 발화 제어 (설계 문서 §3.4b 초기 이벤트).
 *
 * 판정은 순수 함수(`utils/firstSync.ts`)가 하고, 이 훅은 부작용만 담당한다:
 * localStorage 락, 분석 이벤트, 모달 상태.
 *
 * R2 는 **localStorage 만** 쓴다. `users/{uid}/milestones` 서브컬렉션 write 는 rules 가
 * 비공개 저장소(orider-g1-web)에 있어 아직 없다 — 없는 rules 에 write 하면 권한 오류만 쌓인다.
 * 서버 판정 마일스톤은 R3 에서 도입한다.
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

export function useFirstSyncCelebration(
  runs: Activity[],
  loading: boolean,
  uid: string | null,
): FirstSyncCelebrationState {
  const [show, setShow] = useState(false);
  const [activityId, setActivityId] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !uid) return;
    const key = firstSyncStorageKey(uid);
    const decision = decideFirstSync(runs, Date.now(), readMarked(key));

    debugLog("firstSync.decision", { action: decision.action, runs: runs.length });

    if (decision.action === "celebrate") {
      const newest = runs.reduce((a, b) => (b.startTime > a.startTime ? b : a));
      writeMarked(key, String(Date.now()));
      setActivityId(newest.id);
      setShow(true);
      track("or_first_sync_celebrated", { runCount: runs.length });
    } else if (decision.action === "mark-silently") {
      // 소급분: 모달 없이 달성 처리만 — 다음 방문에도 뜨지 않는다.
      writeMarked(key, "backfill");
      track("or_first_sync_backfilled", { runCount: runs.length });
    }
  }, [runs, loading, uid]);

  return { show, activityId, dismiss: () => setShow(false) };
}
