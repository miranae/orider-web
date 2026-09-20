export type ActivityOverviewBand = "lower" | "usual" | "higher";

export interface ActivityOverviewPresentation {
  coachSentence: string;
  availability?: {
    personal: "available" | "character_uncertain" | "insufficient_history" | "unavailable";
    records: "evaluated" | "not_applicable" | "private" | "unavailable";
    power: "available" | "private" | "not_applicable" | "unavailable";
    heartRate: "available" | "private" | "unavailable";
  };
  /**
   * 성격 판정 근거. `"none"` 은 **임계값이 없어 판정하지 못했다** 는 뜻이다 — "확인 중" 이
   * 아니라 FTP·최대심박을 설정하기 전까지 영원히 채워지지 않는 상태다.
   * @sync-with orider-g1-web/shared/types/activity-overview.ts
   */
  thresholdBasis?: "user" | "power_ftp" | "hr_lthr" | "hr_max" | "none";
  priorFitnessStatus?: { asOf: string; formBand: "overload" | "needsRecovery" | "productive" | "fresh" | "overRecovered";
    ctl: number; atl: number; tsb: number };
  session: {
    discipline: "bike" | "run" | "swim" | "other";
    character?: "recovery" | "endurance" | "tempo" | "threshold" | "interval" | "race" | "mixed" | "polarized" | "racePace";
    movingSec?: number;
    distanceKm?: number;
    load?: number;
    loadKind?: "tss" | "load";
    intensityFactor?: number;
    normalizedPowerW?: number;
    elevationGainM?: number;
    caloriesKcal?: number;
    classificationReason?: string;
  };
  personal?: Array<{ axis: string; personalIndex: number; band: ActivityOverviewBand; sampleCount: number }>;
  comparisonMetadata?: { windowDays: number; character: string; priorSampleCount: number;
    historyCompleteness: "complete" | "incomplete" | "unknown" };
  recovery?: { hours: number; load: number; ctl?: number };
  zones?: Array<{ kind: "power" | "heartRate"; seconds: number[]; priority: "primary" | "secondary";
    currentPercentages?: number[]; baselinePercentages?: number[]; deltaPercentagePoints?: number[]; priorSampleCount?: number }>;
  routeLoad?: { climbCount?: number; highestCategory?: string; avgGradePct?: number; maxGradePct?: number;
    elevationSuspect?: boolean };
  powerFingerprint?: Array<{ duration: string; watts: number; medianWatts?: number; deltaPct?: number;
    competitionRank?: number; isBestInWindow?: boolean; tiedBest?: boolean; priorSampleCount?: number;
    recordAchievement?: "first" | "new" | "tie" }>;
  runRecordAchievements?: Array<{ distance: string; valueSec: number; competitionRank: number;
    recordAchievement: "first" | "new" | "tie" }>;
  thresholdWork?: { matchesCount?: number; matchesTotalSec?: number; longestZ4PlusSec?: number;
    anaerobicSec?: number; wPrimeDepletionPct?: number; wPrimeRemainingPct?: number };
  energy?: { totalKcal: number; fatKcal?: number; carbKcal?: number; fatPct?: number; carbPct?: number };
  sportDetails?: Array<{ label: string; value: string; priority: "primary" | "secondary" }>;
  qualityNote?: boolean;
  /**
   * 활동 성격의 물 은유. 세기 순서가 이름에 들어 있다 — 고요한 물 < 시냇물 < 강물 < 물결 < 급류 < 파도 < 폭포.
   * `currents` 는 여러 강도가 섞인 세션이고, `swollen` 은 같은 성격의 내 평소보다 유산소량이 많았다는 뜻이다.
   * 서버가 확정해 보내며 화면은 칩으로만 그린다(재분류 금지). 성격이 없으면 은유도 없다.
   * @sync-with orider-g1-web/shared/types/activity-overview.ts
   */
  water?: {
    cue: ActivityWaterCue;
    swollen?: boolean;
    /**
     * 오늘의 하이라이트 — 이 활동에서 가장 이야기할 만한 한 순간. 있으면 물은 성격이 아니라 이 순간의 세기를
     * 따른다(긴 라이딩의 결정적 5분이 평균에 희석되지 않도록). `reason` 은 표시 언어로 쓰인 한 줄 근거다.
     */
    highlight?: { kind: "sprint" | "surge" | "sustained"; reason: string };
  };
}

/** shoals(여울) = 양극화 — 잔잔한 물과 빠른 물이 번갈아 이어진다. whirlpool(소용돌이) = 레이스 페이스 — 여러 강도가 한데 휘몰아친다. */
export type ActivityWaterCue = "still" | "stream" | "river" | "ripples" | "rapids" | "waves" | "waterfall" | "currents" | "shoals" | "whirlpool";


export const ACTIVITY_OVERVIEW_VERSION = "activity-overview-v1" as const;
export type ActivityOverviewPartialReason = "record_receipt" | "fitness" | "history";
export type ActivityOverviewResponse =
  | { status: "available"; activityId: string; version: typeof ACTIVITY_OVERVIEW_VERSION;
      inputDigest: string; presentation: ActivityOverviewPresentation; partialReasons?: ActivityOverviewPartialReason[] }
  | { status: "unavailable"; activityId: string; reason: "rollout_disabled" | "metrics_unavailable" | "input_changed" };
