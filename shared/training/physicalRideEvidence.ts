import { acceptedActivityLoad } from './acceptedActivityLoad';
import { disciplineOfType } from '../sport/discipline';

/** 대표 선정의 부하 증거는 검증된 기록·서버 확정값만 사용한다. 반올림된 확정 0도 증거이며,
 * raw 0 sentinel은 기존 부하 계약을 따르고, pending 중 마지막 확정값은 유지한다. 시간·FTP 기반 추정은 대표 순위를 바꾸지 않는다.
 */
export function physicalRideLoadEvidence(activity: Record<string, unknown>): boolean {
  const discipline = disciplineOfType(activity.type);
  return discipline !== null && acceptedActivityLoad(activity, discipline).reliable;
}

/** 서버·웹 모두 동일한 유효 duration 폴백을 사용한다. */
export function physicalRideMovingSeconds(activity: Record<string, unknown>): number | null {
  const summary = (activity.summary ?? {}) as Record<string, unknown>;
  const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (positive(summary.movingTimeSec)) return summary.movingTimeSec;
  for (const value of [summary.movingTimeMillis, summary.ridingTimeMillis, summary.elapsedTimeMillis]) {
    if (positive(value)) return value / 1000;
  }
  return null;
}
