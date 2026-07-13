import type { ClimbMetric } from "@shared/types/activity-metrics";
import type { ClimbSegment } from "./advancedMetrics";

export interface ClimbTableRow {
  startKm: number;
  lengthKm: number;
  elevationGain: number;
  avgGrade: number;
  category: ClimbMetric["category"];
  durationSec: number | null;
  /** 활동 시작부터 클라임 시작 지점까지의 경과 시간. */
  entrySec: number | null;
  vam: number | null;
  avgPower: number | null;
  wPerKg: number | null;
}

interface ClimbTimeStreams {
  distance?: ReadonlyArray<number>;
  time?: ReadonlyArray<number>;
  /** 활동 세션 시작 epoch. epoch time 스트림은 반드시 이 값을 기준으로 뺀다. */
  activityStartTime?: number | null;
  /** 정지시간을 포함한 활동 총 경과시간. 상대 time 스트림의 초/ms 판별에만 사용. */
  elapsedDurationSec?: number | null;
  /**
   * route-relative FIT 스트림 시작이 첫 timestamped record보다 늦은 초 수.
   * relative time 에만 정확히 한 번 더한다. time 값에 이미 offset을 합쳤다면 전달하지 않는다.
   */
  routeOffsetSec?: number | null;
  /** timestamp가 존재하는 첫 FIT record epoch milliseconds. routeOffsetSec의 기준점. */
  routeRecordStartTimeMs?: number | null;
}

const ENTRY_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveOrNull(value: unknown): number | null {
  return finite(value) && value > 0 ? value : null;
}

function nonNegativeOrNull(value: unknown): number | null {
  return finite(value) && value >= 0 ? value : null;
}

function epochSeconds(value: unknown): number | null {
  if (!finite(value)) return null;
  if (value >= 1e11) return value / 1000;
  if (value >= 1e9) return value;
  return null;
}

/** epoch 초/밀리초 활동 시작시각 + 경과 초를 브라우저 현지 시각으로 표시한다. */
export function formatClimbEntryTime(
  startTime: number | null | undefined,
  entrySec: number | null | undefined,
  locale?: string,
): string | null {
  if (!finite(startTime) || !finite(entrySec) || entrySec < 0) return null;
  const startTimeSec = epochSeconds(startTime);
  if (startTimeSec == null) return null;

  const date = new Date((startTimeSec + entrySec) * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, ENTRY_TIME_FORMAT).format(date);
}

/** functions/src/utils/climb-category.ts 와 동일한 score/threshold 계약. */
function fallbackCategory(lengthKm: number, avgGrade: number): ClimbMetric["category"] {
  const score = lengthKm * 1000 * avgGrade;
  if (score >= 80_000) return "HC";
  if (score >= 64_000) return "Cat1";
  if (score >= 32_000) return "Cat2";
  if (score >= 16_000) return "Cat3";
  if (score >= 8_000) return "Cat4";
  return null;
}

function validCategory(value: unknown): value is ClimbMetric["category"] {
  return value === null || value === "HC" || value === "Cat1" || value === "Cat2"
    || value === "Cat3" || value === "Cat4";
}

function relativeTimeDivisor(
  time: ReadonlyArray<number>,
  length: number,
  elapsedDurationSec: number | null | undefined,
  routeOffsetSec: number,
): 1 | 1000 {
  if (!finite(elapsedDurationSec) || elapsedDurationSec <= 0) return 1;
  const finiteTimes = time.slice(0, length).filter(finite);
  if (finiteTimes.length < 2) return 1;
  const rawSpan = finiteTimes[finiteTimes.length - 1]! - finiteTimes[0]!;
  if (!Number.isFinite(rawSpan) || rawSpan <= 0) return 1;

  // summary 경과시간은 세션 기준이므로 route offset을 제외한 스트림 span과 비교한다.
  const expectedSpan = Math.max(elapsedDurationSec - routeOffsetSec, 0);
  const normalizedError = (candidate: number) => (
    Math.abs(candidate - expectedSpan) / Math.max(expectedSpan, 1)
  );
  return normalizedError(rawSpan / 1000) < normalizedError(rawSpan) ? 1000 : 1;
}

/**
 * startKm 에 최초 도달/초과한 거리 샘플에 매핑해 활동 시작 후 진입 시간을 계산한다.
 * time 은 상대 초/밀리초 또는 epoch 초/밀리초를 모두 허용한다. epoch 스트림은
 * activityStartTime 기준, 상대 스트림은 저장 계약상 초가 기본이며 summary 경과시간이
 * 있을 때만 전체 span 오차를 비교해 밀리초를 선택한다.
 */
function climbEntrySec(startKm: number, streams?: ClimbTimeStreams): number | null {
  const distance = streams?.distance;
  const time = streams?.time;
  if (!distance?.length || !time?.length) return null;

  const length = Math.min(distance.length, time.length);
  const firstTime = time.find((value, index) => index < length && finite(value));
  if (!finite(firstTime)) return null;

  const absoluteTime = epochSeconds(firstTime) != null;
  const routeOffsetSec = nonNegativeOrNull(streams?.routeOffsetSec) ?? 0;
  const activityStartSec = epochSeconds(streams?.activityStartTime);
  const routeRecordStartSec = epochSeconds(streams?.routeRecordStartTimeMs);
  const routeStartFromActivitySec = routeRecordStartSec != null && activityStartSec != null
    ? routeRecordStartSec - activityStartSec + routeOffsetSec
    : routeOffsetSec;
  const relativeDivisor = absoluteTime
    ? 1
    : relativeTimeDivisor(time, length, streams?.elapsedDurationSec, routeStartFromActivitySec);

  const targetM = startKm * 1000;
  let entryIndex = -1;
  for (let i = 0; i < length; i++) {
    const distanceValue = distance[i];
    const timeValue = time[i];
    if (!finite(distanceValue) || !finite(timeValue)) continue;
    if (distanceValue >= targetM) {
      entryIndex = i;
      break;
    }
  }
  if (entryIndex < 0) return null;

  const raw = time[entryIndex];
  if (!finite(raw)) return null;
  const rawEpochSec = epochSeconds(raw);
  const elapsed = absoluteTime
    ? rawEpochSec != null && activityStartSec != null
      ? rawEpochSec - activityStartSec
      : null
    : raw / relativeDivisor + routeStartFromActivitySec;
  if (elapsed == null) return null;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

function normalizeServerClimb(value: unknown, streams?: ClimbTimeStreams): ClimbTableRow | null {
  if (!value || typeof value !== "object") return null;
  const climb = value as Partial<ClimbMetric>;
  if (
    !finite(climb.startKm) || climb.startKm < 0
    || !finite(climb.lengthKm) || climb.lengthKm <= 0
    || !finite(climb.elevationGainM) || climb.elevationGainM < 0
    || !finite(climb.avgGrade)
  ) return null;

  return {
    startKm: climb.startKm,
    lengthKm: climb.lengthKm,
    elevationGain: climb.elevationGainM,
    avgGrade: climb.avgGrade,
    category: validCategory(climb.category) ? climb.category : null,
    durationSec: positiveOrNull(climb.durationSec),
    entrySec: climbEntrySec(climb.startKm, streams),
    vam: positiveOrNull(climb.vam),
    avgPower: nonNegativeOrNull(climb.avgPower),
    wPerKg: nonNegativeOrNull(climb.wPerKg),
  };
}

/**
 * 서버 문서에 climbs 배열이 있으면(빈 배열 포함) 그 결과를 정본으로 사용한다.
 * 구버전 문서처럼 배열 자체가 없을 때만 스트림 기반 클라이언트 탐지 결과로
 * 폴백한다. 서버 배열 안의 손상 행은 정상 행을 보존한 채 제외한다.
 */
export function buildClimbTableRows(
  serverClimbs: unknown,
  clientClimbs: ClimbSegment[],
  streams?: ClimbTimeStreams,
): ClimbTableRow[] {
  if (Array.isArray(serverClimbs)) {
    // 배열은 서버 정본이다. 혼합 문서에서는 정상 행을 보존하고 손상 행만 제외한다.
    return serverClimbs
      .map((climb) => normalizeServerClimb(climb, streams))
      .filter((row): row is ClimbTableRow => row !== null);
  }

  return clientClimbs.map((climb) => ({
    ...climb,
    category: fallbackCategory(climb.lengthKm, climb.avgGrade),
    entrySec: climbEntrySec(climb.startKm, streams),
    avgPower: null,
    wPerKg: null,
  }));
}
