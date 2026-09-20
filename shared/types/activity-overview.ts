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
  /** 활동이 반영된 뒤의 상태 — 활동일 일별 정산 지점. 시작 전과 나란히 두면 이 활동이 몸에 준 변화가 보인다. */
  postFitnessStatus?: { asOf: string; formBand: "overload" | "needsRecovery" | "productive" | "fresh" | "overRecovered";
    ctl: number; atl: number; tsb: number };
  /**
   * 오늘의 최고 순간 — 정본 `metrics.peakEfforts.highlight` 에 세그먼트 이름을 붙인 것. 숫자 나열이 아니라
   * "남한산성 오르막에서 1분 371W, 51km/h, 최고심박 191" 이라는 장면. 세그먼트와 겹치지 않으면 km 구간만 있다.
   */
  peakMoment?: { durationSec: number; avgPowerW: number; fromKm?: number; toKm?: number; avgSpeedKmh?: number; maxHr?: number;
    segmentName?: string; segmentPr?: boolean };
  session: {
    discipline: "bike" | "run" | "swim" | "other";
    character?: "recovery" | "endurance" | "tempo" | "threshold" | "highIntensity"
      | "interval" | "race" | "mixed" | "polarized" | "racePace";
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
    /** 계측 존 시간 비중(%, 소수 1자리). 비교가 없어도 항상 채워진다 — 소비처가 초에서 다시 나누지 않는다. */
    currentPercentages?: number[]; baselinePercentages?: number[]; deltaPercentagePoints?: number[]; priorSampleCount?: number;
    /** 비교 기준 코호트. `discipline` 은 같은 성격 표본이 부족해 종목 전체로 넓힌 것 — 표시할 때 밝힌다. */
    baselineScope?: "sameCharacter" | "discipline" }>;
  routeLoad?: { climbCount?: number; highestCategory?: string; avgGradePct?: number; maxGradePct?: number;
    elevationSuspect?: boolean;
    /**
     * 지형 라벨. 서버가 검증된 고도·거리·클라임에서 정한다 — 업힐 위주(km당 상승 15m 이상 또는 HC/Cat1 포함),
     * 평지 위주(km당 5m 이하·Cat3 이상 없음). 그 사이는 라벨을 두지 않는다(말할 가치가 없다).
     */
    terrain?: "climbing" | "flat" };
  powerFingerprint?: Array<{ duration: string; watts: number; medianWatts?: number; deltaPct?: number;
    competitionRank?: number; isBestInWindow?: boolean; tiedBest?: boolean; priorSampleCount?: number;
    recordAchievement?: "first" | "new" | "tie";
    /** 이 구간의 내 역대 최고(이번 활동 포함). 기록 영수증이 평가됐을 때만 채워진다 — 표본 조건 없이 항상 비교할 수 있는 기준. */
    allTimeBestWatts?: number;
    /** watts ÷ allTimeBestWatts × 100 (상한 100). 서버가 한 번 계산한다 — 소비처가 각자 나누지 않는다. */
    allTimeBestPct?: number }>;
  runRecordAchievements?: Array<{ distance: string; valueSec: number; competitionRank: number;
    recordAchievement: "first" | "new" | "tie" }>;
  thresholdWork?: { matchesCount?: number; matchesTotalSec?: number; longestZ4PlusSec?: number;
    anaerobicSec?: number; wPrimeDepletionPct?: number; wPrimeRemainingPct?: number;
    /** FTP 초과분으로 한 일(kJ) — "무산소 운동량". 옛 지표 문서엔 없다. */ aboveFtpKj?: number };
  /** `fatGrams` = 지방 연소 kcal ÷ 9. 서버 지표(substrate.fatGrams)에서 그대로 온다 — 화면·게시가 따로 나누지 않는다. */
  energy?: { totalKcal: number; fatKcal?: number; carbKcal?: number; fatPct?: number; carbPct?: number; fatGrams?: number };
  sportDetails?: Array<{ label: string; value: string; priority: "primary" | "secondary" }>;
  qualityNote?: boolean;
  /**
   * 같은 성격의 내 평소보다 유산소량이 많았는가. 성격 라벨에 "평소보다 많이" 로 덧붙는다.
   * 칩에 오른 성격과 비교 코호트가 일치할 때만 채워진다.
   */
  aboveUsualVolume?: boolean;
  /**
   * 오늘의 하이라이트 — 이 활동에서 가장 이야기할 만한 근거 한 줄. 표시 언어로 쓰여 온다.
   *
   * 라벨은 성격이 정하고, 이 값은 "왜 그렇게 불렀나" 를 설명한다. 근거가 없으면 비어 있다 —
   * 없는 자랑을 만들지 않기 위해서다.
   */
  highlight?: { kind: "sprint" | "surge" | "sustained"; reason: string };
}



export const ACTIVITY_OVERVIEW_VERSION = "activity-overview-v1" as const;
export type ActivityOverviewPartialReason = "record_receipt" | "fitness" | "history";
export type ActivityOverviewResponse =
  | { status: "available"; activityId: string; version: typeof ACTIVITY_OVERVIEW_VERSION;
      inputDigest: string; presentation: ActivityOverviewPresentation; partialReasons?: ActivityOverviewPartialReason[] }
  | { status: "unavailable"; activityId: string; reason: "rollout_disabled" | "metrics_unavailable" | "input_changed" };
