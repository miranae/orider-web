export type WorkoutKind =
  | 'rest' | 'rec' | 'z2' | 'z2Long' | 'tempo' | 'ftp' | 'vo2' | 'sim' | 'goal'
  // 달리기
  | 'easyRun' | 'tempoRun' | 'intervalRun' | 'longRun' | 'recoveryRun'
  | 'stridesRun' | 'progressRun' | 'threshRun' | 'raceRun'
  // 수영
  | 'easySwim' | 'drillSwim' | 'intervalSwim' | 'longSwim' | 'recoverySwim'
  | 'kickSwim' | 'enduranceSwim' | 'cssSwim' | 'racepaceSwim' | 'sprintSwim' | 'owSwim' | 'brickSwim';

export type FeasibilityLabel = 'easy' | 'on_track' | 'stretch' | 'risky';

export type GoalStatus = 'active' | 'completed' | 'abandoned';

export type EventType =
  | 'completion' | 'time' | 'race'
  // 달리기 거리
  | '5k' | '10k' | 'half' | 'full'
  // 수영
  | 'ows1500' | 'ows3000' | 'pool400' | 'pool800' | 'pool1500';

export type AdaptationSeverity = 'info' | 'warn' | 'critical';
export type AdjustmentReason = 'compliance_low' | 'compliance_high' | 'manual' | 'recovery_critical';

export interface AdaptationFlag {
  /** 사용자에게 reroll 제안을 띄울지 (warn/critical일 때 true) */
  shouldRerollSuggested: boolean;
  severity: AdaptationSeverity;
  /** 한글 사유 메시지 — 배너에 그대로 표시 */
  reason: string;
  /** 평가 시점 ms */
  evaluatedAt: number;
  /** 사용자가 "1주 미루기"를 선택한 경우 이 시점까지는 배너 숨김 */
  snoozedUntil?: number;
  /** 평가에 쓰인 보조 지표 — 디버깅/UI 보조용 */
  recent4wRatio?: number;
  streakWeeksOff?: number;
  /** ratio 계산 reproducibility — production/검증 시스템 비교 디버깅용.
   * recent4wRatio = recent4wActualSum / recent4wPlannedSum (plannedSum=0이면 1.0) */
  recent4wActualSum?: number;
  recent4wPlannedSum?: number;
}

export interface Goal {
  id: string;
  userId: string;
  discipline?: 'bike' | 'run' | 'swim';
  courseId: string;
  courseName: string;
  courseDist: number;  // km
  courseElev: number;   // m
  eventType: EventType;
  eventDate: number;    // timestamp ms
  targetDurationMin?: number;
  weeklySessions: 3 | 4 | 5 | 6;
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
  snapshot: {
    ftp: number;
    weightKg: number;
    ctl: number;
  };
  feasibility: {
    label: FeasibilityLabel;
    requiredWkg?: number;
    sustainableWkg?: number;
    gapWkg?: number;
    /** 피로도(TSB) 기반 sustainableWkg 보정율(%, 0=무보정, -10=10% 하향) */
    fatigueAdjustmentPct?: number;
    computedAt: number;
  };
  /** Phase 1: 자동 적응 — 평가 결과/스누즈 상태 */
  adaptationFlag?: AdaptationFlag;
  /** Phase 1: 마지막으로 주간 조정이 적용된 weekId — idempotency 가드 */
  lastAdjustmentWeekId?: string;
  /** 마지막 조정 종류 — factor(통상 ±15%) vs recovery(critical overload 강제 회복).
   *  같은 주에 recovery 후 factor 적용을 허용하기 위해 kind별로 idempotency 분리. */
  lastAdjustmentKind?: 'factor' | 'recovery';
}

export interface PlanDay {
  date: number;        // timestamp ms, 00:00 KST
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workout: WorkoutKind;
  plannedTSS: number;
  plannedDurationMin: number;
  /** Phase 1: 주간 조정 적용 시 채워짐. plannedTSS는 원본 보존. */
  adjustedTSS?: number;
  adjustedDurationMin?: number;
  actualActivityId?: string;
  actualTSS?: number;
  completed: boolean;
  skipped: boolean;
  /** 구조화 워크아웃 인터벌 (#476: .zwo/.erg/.mrc 임포트). 미설정이면 단순 부하 기반 플랜. */
  intervals?: IntervalBlock[];
  /** 임포트한 워크아웃 이름 (구조화 워크아웃 표시용). */
  workoutName?: string;
}

export interface PlanWeek {
  id: string;          // 'week-01' ~ 'week-12'
  weekNumber: number;
  phase: 'build' | 'peak' | 'taper';
  startDate: number;   // timestamp ms
  plannedTSS: number;
  days: PlanDay[];
  /** Phase 1: 주간 조정 메타. 미설정이면 미조정. */
  adjustmentFactor?: number;       // [0.85, 1.15]
  adjustmentReason?: AdjustmentReason;
  adjustedAt?: number;
}

export interface IntervalBlock {
  label: 'WU' | 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'R' | 'CD';
  durationMin: number;
  targetPowerW?: [number, number];
}

export interface FitnessProjection {
  computedAt: number;
  /** 활성 goal이 없는 사용자의 sentinel 문서에서는 null */
  goalId: string | null;
  discipline?: string;
  /** 오늘 시점의 실측 CTL/ATL/TSB — 서버가 recomputeProjection 시 계산해 저장. */
  currentCtl?: number;
  currentAtl?: number;
  currentTsb?: number;
  /** 계획 미래일자 시뮬레이션 시리즈 (오늘 이후) */
  series: Array<{ date: number; ctl: number; atl: number; tsb: number }>;
  goalDay: {
    ctl: number;
    tsb: number;
    adherenceRate: number;
  };
  /** sentinel 문서 표식 — lazy revalidate가 활성 goal 없는 사용자에게 기록.
   *  무한 revalidate 호출 차단용. 실제 데이터 아님. */
  sentinel?: boolean;
  sentinelReason?: string;
}
