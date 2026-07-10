import type { Activity } from "@shared/types";
import { getDiscipline } from "./disciplineFilter";
import type { Discipline } from "./disciplineFilter";

export type { Discipline };

/**
 * 연말결산(Year in Review) 순수 집계 유틸.
 *
 * 활동 배열을 입력받아 한 해(또는 임의 기간)의 총합·종목별 분해·최고 기록·월별 추이를
 * 산출한다. 네트워크/DOM 의존이 전혀 없는 순수함수라 단위테스트로 합계/분해를 검증한다
 * (yearRecap.test.ts). 종목 분류는 disciplineFilter.getDiscipline 을 재사용.
 */

/** 종목별 분해 한 칸 */
export interface DisciplineBreakdown {
  discipline: Discipline;
  count: number;
  /** 합산 거리 (m) */
  distanceMeters: number;
  /** 합산 이동/경과 시간 (ms) */
  durationMillis: number;
  /** 합산 고도 (m) */
  elevationMeters: number;
}

/** 최고 노력(단일 활동 기준) — 없으면 null */
export interface RecapHighlight {
  activityId: string;
  /** 해당 지표 값 */
  value: number;
  /** 활동 시작 시각 (epoch ms) */
  startTime: number;
  type: string;
}

/** 월별 추이 한 칸 (0 = 1월) */
export interface MonthlyPoint {
  /** 0~11 */
  month: number;
  count: number;
  distanceMeters: number;
  durationMillis: number;
  elevationMeters: number;
}

/** 90일 일관성 루프 요약 */
export interface ConsistencySummary {
  windowDays: number;
  activeDays: number;
  activeWeeks: number;
  longestStreakDays: number;
  currentStreakDays: number;
  score: number;
}

/** 연말결산 집계 결과 */
export interface YearRecap {
  year: number;
  /** 집계 대상 활동 수 */
  totalCount: number;
  /** 총 거리 (m) */
  totalDistanceMeters: number;
  /** 총 이동/경과 시간 (ms) */
  totalDurationMillis: number;
  /** 총 고도 (m) */
  totalElevationMeters: number;
  /** 총 칼로리 (kcal) — 값이 있는 활동만 합산 */
  totalCalories: number;
  /** 활동한 날 수 (서로 다른 날짜) */
  activeDays: number;
  /** 종목별 분해 (활동이 있는 종목만, 거리 내림차순) */
  byDiscipline: DisciplineBreakdown[];
  /** 가장 많이 한 종목 (활동수 기준), 없으면 null */
  topDiscipline: Discipline | null;
  /** 최장 거리 단일 활동 */
  longestDistance: RecapHighlight | null;
  /** 최장 시간 단일 활동 */
  longestDuration: RecapHighlight | null;
  /** 최대 고도 단일 활동 */
  biggestClimb: RecapHighlight | null;
  /** 월별 추이 (항상 12칸, 1월~12월) */
  monthly: MonthlyPoint[];
  /** 최근 90일 일관성 요약 */
  consistency90d: ConsistencySummary;
}

/** 안전한 숫자 변환 — null/undefined/NaN/음수는 0 */
function num(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v) || v < 0) return 0;
  return v;
}

/** 활동의 이동 시간(ms). movingTimeSec 가 있으면 우선, 없으면 경과(ridingTimeMillis). */
function durationMillisOf(a: Activity): number {
  const movingSec = a.summary?.movingTimeSec;
  if (movingSec != null && Number.isFinite(movingSec) && movingSec > 0) {
    return movingSec * 1000;
  }
  return num(a.summary?.ridingTimeMillis);
}

/** epoch ms → 로컬 'YYYY-MM-DD' (활동한 날 집계용) */
function localDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function localDayOrdinal(ts: number): number {
  const d = new Date(ts);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

function computeConsistency90d(dayOrdinals: Set<number>, year: number, nowMs: number): ConsistencySummary {
  const now = new Date(nowMs);
  const windowEnd = now.getFullYear() === year
    ? localDayOrdinal(nowMs)
    : localDayOrdinal(new Date(year, 11, 31).getTime());
  const windowDays = 90;
  const windowStart = windowEnd - windowDays + 1;
  const active = Array.from(dayOrdinals)
    .filter((d) => d >= windowStart && d <= windowEnd)
    .sort((a, b) => a - b);

  let longestStreakDays = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of active) {
    run = prev != null && d === prev + 1 ? run + 1 : 1;
    longestStreakDays = Math.max(longestStreakDays, run);
    prev = d;
  }

  let currentStreakDays = 0;
  for (let d = windowEnd; d >= windowStart; d--) {
    if (!dayOrdinals.has(d)) break;
    currentStreakDays += 1;
  }

  const activeWeeks = new Set(active.map((d) => Math.floor((d - windowStart) / 7))).size;
  const activeDays = active.length;
  const score = Math.round(
    Math.min(50, (activeDays / windowDays) * 50) +
    Math.min(30, (activeWeeks / 13) * 30) +
    Math.min(20, (longestStreakDays / 30) * 20),
  );

  return { windowDays, activeDays, activeWeeks, longestStreakDays, currentStreakDays, score };
}

/**
 * 활동 배열에서 특정 연도의 연말결산을 집계한다.
 * @param activities 활동 배열 (연도 무관, 내부에서 필터링)
 * @param year 대상 연도 (예: 2026). 활동의 startTime 로컬 연도 기준 필터.
 */
export function computeYearRecap(activities: Activity[], year: number, nowMs = Date.now()): YearRecap {
  const inYear = (activities ?? []).filter(
    (a) => a?.summary != null && new Date(a.startTime).getFullYear() === year,
  );

  let totalDistanceMeters = 0;
  let totalDurationMillis = 0;
  let totalElevationMeters = 0;
  let totalCalories = 0;
  const dayKeys = new Set<string>();
  const dayOrdinals = new Set<number>();

  // 종목별 누적
  const discMap = new Map<Discipline, DisciplineBreakdown>();
  // 월별 누적 (12칸 초기화)
  const monthly: MonthlyPoint[] = Array.from({ length: 12 }, (_, month) => ({
    month,
    count: 0,
    distanceMeters: 0,
    durationMillis: 0,
    elevationMeters: 0,
  }));

  let longestDistance: RecapHighlight | null = null;
  let longestDuration: RecapHighlight | null = null;
  let biggestClimb: RecapHighlight | null = null;

  for (const a of inYear) {
    const dist = num(a.summary.distance);
    const dur = durationMillisOf(a);
    const elev = num(a.summary.elevationGain);
    const cal = num(a.summary.calories);

    totalDistanceMeters += dist;
    totalDurationMillis += dur;
    totalElevationMeters += elev;
    totalCalories += cal;
    dayKeys.add(localDayKey(a.startTime));
    dayOrdinals.add(localDayOrdinal(a.startTime));

    // 종목별
    const disc = getDiscipline(a.type);
    const bucket = discMap.get(disc) ?? {
      discipline: disc,
      count: 0,
      distanceMeters: 0,
      durationMillis: 0,
      elevationMeters: 0,
    };
    bucket.count += 1;
    bucket.distanceMeters += dist;
    bucket.durationMillis += dur;
    bucket.elevationMeters += elev;
    discMap.set(disc, bucket);

    // 월별
    const m = new Date(a.startTime).getMonth();
    const mp = monthly[m];
    if (mp) {
      mp.count += 1;
      mp.distanceMeters += dist;
      mp.durationMillis += dur;
      mp.elevationMeters += elev;
    }

    // 최고 노력
    if (dist > 0 && (longestDistance == null || dist > longestDistance.value)) {
      longestDistance = { activityId: a.id, value: dist, startTime: a.startTime, type: a.type };
    }
    if (dur > 0 && (longestDuration == null || dur > longestDuration.value)) {
      longestDuration = { activityId: a.id, value: dur, startTime: a.startTime, type: a.type };
    }
    if (elev > 0 && (biggestClimb == null || elev > biggestClimb.value)) {
      biggestClimb = { activityId: a.id, value: elev, startTime: a.startTime, type: a.type };
    }
  }

  const byDiscipline = Array.from(discMap.values()).sort(
    (x, y) => y.distanceMeters - x.distanceMeters,
  );

  // 가장 많이 한 종목 (활동수 기준; 동률이면 거리 큰 쪽)
  let topDiscipline: Discipline | null = null;
  let topCount = -1;
  let topDist = -1;
  for (const b of byDiscipline) {
    if (b.count > topCount || (b.count === topCount && b.distanceMeters > topDist)) {
      topDiscipline = b.discipline;
      topCount = b.count;
      topDist = b.distanceMeters;
    }
  }

  return {
    year,
    totalCount: inYear.length,
    totalDistanceMeters,
    totalDurationMillis,
    totalElevationMeters,
    totalCalories,
    activeDays: dayKeys.size,
    byDiscipline,
    topDiscipline,
    longestDistance,
    longestDuration,
    biggestClimb,
    monthly,
    consistency90d: computeConsistency90d(dayOrdinals, year, nowMs),
  };
}

/** 활동 배열에 존재하는 연도 목록 (내림차순). 연도 선택 드롭다운용. */
export function availableRecapYears(activities: Activity[]): number[] {
  const years = new Set<number>();
  for (const a of activities ?? []) {
    if (a?.summary == null || !Number.isFinite(a.startTime)) continue;
    years.add(new Date(a.startTime).getFullYear());
  }
  return Array.from(years).sort((x, y) => y - x);
}
