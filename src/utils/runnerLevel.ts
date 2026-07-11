/**
 * 러너 레벨 추정 (설계 문서 §3.1).
 *
 * v1 의 온보딩 자기신고 단계는 철회됐다 — 1회성이라 곧 stale 해지고, 온보딩 이탈만 늘린다.
 * 대신 동기화된 이력에서 **세션 파생값**으로 추정한다 (저장하지 않는다).
 *
 * ## 콜드스타트 규칙 (중요)
 * 타깃은 "방금 Strava 를 연결한 졸업생 러너"다. 연결 직후에는 백필 깊이에 따라 이력이
 * 8주에 못 미칠 수 있다. 이때 `novice` 로 떨어뜨리면 **주 4회 뛰는 사람에게 입문자용 툴팁이
 * 쏟아진다.** 그래서 표본이 부족하면 초보가 아니라 **중립(`casual`)** 으로 둔다.
 * "데이터 부족 = 초보"는 금지된 매핑이다.
 */
import type { Activity } from "@shared/types";
import { debugLog } from "../services/errorLogger";

export type RunnerLevel = "novice" | "casual" | "regular";

export interface RunnerLevelResult {
  level: RunnerLevel;
  /** 판정 근거 — 콜드스타트였는지 실제 이력이었는지 구분한다. */
  basis: "history" | "insufficient-history";
  runsPerWeek: number;
  longestRunKm: number;
  weeksObserved: number;
}

const WEEK_MS = 7 * 86400000;
const OBSERVATION_WEEKS = 8;
/** 이 주수만큼의 이력이 없으면 추정하지 않고 중립값으로 둔다. */
const MIN_WEEKS_FOR_ESTIMATE = 4;

/** regular: 주 3회 이상 또는 15km 이상 장거리 경험. */
const REGULAR_RUNS_PER_WEEK = 3;
const REGULAR_LONGEST_KM = 15;
/** novice: 주 1회 미만이고 5km 를 완주한 적 없음. */
const NOVICE_RUNS_PER_WEEK = 1;
const NOVICE_LONGEST_KM = 5;

/**
 * @param runs 러닝 활동만 (호출부에서 종목 필터 적용). 최근 8주 이내로 넘길 것.
 * @param nowMs 기준 시각
 * @param accountCreatedAtMs 계정 생성 시각 — 관측 가능 기간 상한. 없으면 가장 오래된 러닝으로 대체.
 */
export function estimateRunnerLevel(
  runs: Activity[],
  nowMs: number,
  accountCreatedAtMs?: number | null,
): RunnerLevelResult {
  const windowStart = nowMs - OBSERVATION_WEEKS * WEEK_MS;
  const recent = runs.filter((a) => a.startTime >= windowStart && a.summary != null);

  // 관측 가능한 기간의 시작.
  // 계정 생성일을 알면 그것이 기준이다 — 오래된 계정이 최근에만 달렸다면 "그 전엔 안 달렸다"는
  // 사실 자체가 데이터다. 가장 오래된 러닝으로 창을 자르면 주 1회 러너가 늘 "빈도 높음"으로 나온다.
  // 계정 생성일을 모를 때만 가장 오래된 러닝으로 대체한다(그 이전은 알 수 없으므로).
  const oldestRunMs = recent.length > 0 ? Math.min(...recent.map((a) => a.startTime)) : nowMs;
  const historyStart = Math.max(windowStart, accountCreatedAtMs ?? oldestRunMs);
  const weeksObserved = Math.max(0, (nowMs - historyStart) / WEEK_MS);

  const longestRunKm =
    recent.length > 0 ? Math.max(...recent.map((a) => a.summary.distance)) / 1000 : 0;
  const runsPerWeek = weeksObserved > 0 ? recent.length / weeksObserved : 0;

  const insufficient = weeksObserved < MIN_WEEKS_FOR_ESTIMATE;
  const level: RunnerLevel = insufficient
    ? "casual" // 콜드스타트 중립값 — novice 로 떨어뜨리지 않는다
    : runsPerWeek >= REGULAR_RUNS_PER_WEEK || longestRunKm >= REGULAR_LONGEST_KM
      ? "regular"
      : runsPerWeek < NOVICE_RUNS_PER_WEEK && longestRunKm < NOVICE_LONGEST_KM
        ? "novice"
        : "casual";

  const result: RunnerLevelResult = {
    level,
    basis: insufficient ? "insufficient-history" : "history",
    runsPerWeek: Math.round(runsPerWeek * 10) / 10,
    longestRunKm: Math.round(longestRunKm * 10) / 10,
    weeksObserved: Math.round(weeksObserved * 10) / 10,
  };

  // 레벨이 툴팁 노출 빈도·목표 프리셋을 바꾸므로, 어떤 근거로 나왔는지 남긴다.
  debugLog("runnerLevel.estimate", { ...result });
  return result;
}
