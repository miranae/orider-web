/**
 * 주간 러닝 리캡 (설계 문서 §3.4c).
 *
 * 비교는 **지난주 vs 그 전주 2값**만 한다. 일별 막대를 그리려면 일 단위 재집계가 필요한데,
 * 그 비용을 들일 만큼의 정보가 없다.
 *
 * 페이스는 **거리 가중 평균**이다 (Σ시간 / Σ거리). 짧은 회복 조깅 하나가 평균을 통째로
 * 끌어내리면 "지난주보다 느려졌다"는 잘못된 문장이 나온다.
 *
 * 페이스는 낮을수록 빠르므로 개선은 `faster`(단축)로 표현한다 — 문서 §7 카피 톤.
 */
import type { Activity } from "@shared/types";
import { isWithin, seoulWeekRange } from "./seoulWeek";

export interface WeekRunStats {
  count: number;
  distanceKm: number;
  /** 거리 가중 평균 페이스 (sec/km). 러닝이 없으면 null. */
  avgPaceSecPerKm: number | null;
}

export interface RunWeeklyRecap {
  lastWeek: WeekRunStats;
  prevWeek: WeekRunStats;
  /**
   * 지난주가 그 전주보다 얼마나 빨라졌는지 (초/km, 양수 = 단축 = 개선).
   * 두 주 모두 페이스가 있어야 계산된다.
   */
  paceDeltaSec: number | null;
  /** 표시할 변화 방향. 3초 미만 차이는 steady. */
  trend: "faster" | "slower" | "steady" | "unknown";
}

/** 이보다 작은 차이는 노이즈로 본다 (초/km). */
const PACE_TREND_THRESHOLD_SEC = 3;

function aggregate(runs: Activity[]): WeekRunStats {
  let totalMeters = 0;
  let totalSeconds = 0;
  for (const a of runs) {
    const meters = a.summary.distance;
    const speedKmh = a.summary.averageSpeed;
    if (!(meters > 0) || !(speedKmh > 0)) continue;
    totalMeters += meters;
    totalSeconds += (meters / 1000) * (3600 / speedKmh);
  }
  return {
    count: runs.length,
    distanceKm: Math.round((totalMeters / 1000) * 10) / 10,
    avgPaceSecPerKm: totalMeters > 0 ? Math.round(totalSeconds / (totalMeters / 1000)) : null,
  };
}

/**
 * @param runs 러닝 활동만 (호출부에서 종목 필터 적용)
 * @param nowMs 기준 시각
 */
export function computeRunWeeklyRecap(runs: Activity[], nowMs: number): RunWeeklyRecap {
  const lastRange = seoulWeekRange(nowMs, 1);
  const prevRange = seoulWeekRange(nowMs, 2);

  const lastWeek = aggregate(runs.filter((a) => isWithin(a.startTime, lastRange)));
  const prevWeek = aggregate(runs.filter((a) => isWithin(a.startTime, prevRange)));

  if (lastWeek.avgPaceSecPerKm == null || prevWeek.avgPaceSecPerKm == null) {
    return { lastWeek, prevWeek, paceDeltaSec: null, trend: "unknown" };
  }

  // 양수 = 지난주가 더 빠름(초가 줄었음)
  const paceDeltaSec = prevWeek.avgPaceSecPerKm - lastWeek.avgPaceSecPerKm;
  const trend: RunWeeklyRecap["trend"] =
    Math.abs(paceDeltaSec) < PACE_TREND_THRESHOLD_SEC
      ? "steady"
      : paceDeltaSec > 0
        ? "faster"
        : "slower";

  return { lastWeek, prevWeek, paceDeltaSec, trend };
}

/**
 * 리캡을 보여줄 시점인가.
 *
 * 문서는 "월요일 노출"이라 했지만 월요일에 앱을 열지 않는 사용자는 리캡을 영영 못 본다.
 * 주 초반(월~수)까지 노출해 "지난주"가 아직 신선한 동안 보이게 한다.
 */
const RECAP_VISIBLE_UNTIL_WEEKDAY = 2; // 0=월, 2=수

export function isRecapVisible(nowMs: number, weekdayFn: (ms: number) => number): boolean {
  return weekdayFn(nowMs) <= RECAP_VISIBLE_UNTIL_WEEKDAY;
}
