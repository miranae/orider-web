import { useEffect, useState } from "react";
import { STALE_THRESHOLD_MS } from "@shared/training/staleness";

/** 다음 로컬 자정 또는 서버 문서 stale 전환 시점 중 먼저 오는 경계까지의 시간. */
export function nextFitnessClockDelay(now: number, updatedAt?: number): number {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const delays = [nextMidnight.getTime() - now];
  if (Number.isFinite(updatedAt)) {
    const staleDelay = updatedAt! + STALE_THRESHOLD_MS - now + 1;
    if (staleDelay > 0) delays.push(staleDelay);
  }
  return Math.max(1, Math.min(...delays));
}

/** 28일 창의 날짜 경계와 UserFitness 신선도 경계에서 화면 계산 시각을 갱신한다. */
export function useFitnessClock(updatedAt?: number, refreshKey?: string): number {
  const [now, setNow] = useState(() => Date.now());

  // 새 UserFitness 문서나 활동이 도착하면 장시간 열린 탭의 기준 시각도 즉시 전진시킨다.
  // timer effect와 분리해 now 변경이 이 effect를 다시 호출하는 순환을 만들지 않는다.
  useEffect(() => {
    setNow(Date.now());
  }, [updatedAt, refreshKey]);

  useEffect(() => {
    const current = Date.now();
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      nextFitnessClockDelay(current, updatedAt),
    );
    return () => window.clearTimeout(timer);
  }, [updatedAt, now]);

  return now;
}
