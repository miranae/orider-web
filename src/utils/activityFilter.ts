/**
 * 활동 목록 표시 필터 — 측정 오류·우발 기록으로 보이는 trivial 활동 숨김.
 *
 * 모바일 프로필 점검에서 발견: 거리 0.1km / 시간 1초 등 우발 기록이 카드로 그대로 노출됨
 * (사용자가 의도하지 않은 측정 또는 앱이 잠깐 켜진 흔적). 보수적 임계로 명백한 cruft 만 컷.
 *
 * 임계 (현재 하드코딩):
 *   - 거리 < 100m
 *   - 또는 라이딩 시간 < 60s (1분)
 *
 * 향후 UI 토글로 ON/OFF 노출 가능 (localStorage 설정 키). 지금은 항상 필터.
 */
import type { Activity } from "@shared/types";

const MIN_DISTANCE_M = 100;
const MIN_RIDING_TIME_MS = 60_000;

export function isTrivialActivity(a: Activity): boolean {
  const dist = a.summary?.distance ?? 0;
  const dur = a.summary?.ridingTimeMillis ?? 0;
  return dist < MIN_DISTANCE_M || dur < MIN_RIDING_TIME_MS;
}

export function filterOutTrivial<T extends Activity>(activities: T[]): T[] {
  return activities.filter((a) => !isTrivialActivity(a));
}
