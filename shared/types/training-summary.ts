/**
 * 사용자 훈련 요약 — today / week / month 3 윈도우.
 *
 * 용도:
 *  - 오늘의 권장 카드의 fallback narrative 컨텍스트 보강
 *  - LLM (Gemini) 프롬프트의 "최근 패턴" 섹션 입력
 *  - 추후 다른 인사이트 위젯의 공용 백데이터
 *
 * 갱신 주기: PMC projection 과 동일한 "신선도" 트리거 (recomputeProjection)
 *  - 새 활동 ingest 시 자동 (onActivityCreate)
 *  - 페이지 진입 시 stale 판정되면 lazy revalidate
 *
 * 저장 위치: `users/{uid}/fitness/summary_{discipline}` (projection_{discipline} 와 sibling)
 */

export interface TrainingSummary {
  discipline: "bike" | "run" | "swim";
  /** 서버 계산 타임스탬프 (ms). projection.computedAt 과 동일 값. */
  computedAt: number;

  today: TodaySummary;
  week: WeekSummary;
  month: MonthSummary;

  meta: {
    /** 마지막 활동 시작 시각 (ms). 활동 없으면 null. */
    lastActivityAt: number | null;
    /** 최근 30일 활동 개수 (해당 discipline). */
    activityCount30d: number;
  };
}

export interface TodaySummary {
  /** 오늘 (사용자 로컬 자정 기준) 운동 기록 있음 여부. */
  didTrain: boolean;
  /** 오늘 누적 TSS (운동 1+개 합산). 없으면 0. */
  tss: number;
  /** 오늘 누적 운동 시간 분. */
  durationMin: number;
  /** 가장 최근 오늘 활동 이름. 없으면 null. */
  activityName: string | null;
  /** 오늘 활동의 평균 강도 (1~5 zone). 없거나 계산 불가면 null. */
  primaryZone: number | null;
}

export interface WeekSummary {
  /** 최근 7일 운동 세션 수. */
  sessions: number;
  /** 최근 7일 누적 TSS. */
  totalTss: number;
  /** 세션 평균 강도 (정성 라벨 가공용). 0~1 normalized (avgTss / sessions / 100). */
  avgIntensity: number;
  /** 최근 7일 중 가장 높았던 단일 운동 TSS. */
  peakTss: number;
  /** 7일 중 무휴식일 (TSS=0) 일수. */
  restDays: number;
  /** 7일 시작 시점 CTL. */
  ctlStart: number;
  /** 7일 끝(=오늘) 시점 CTL. */
  ctlEnd: number;
  /** 7일 간 일별 TSS — narrative 에 "주중 vs 주말" 패턴 인용용. index 0 = 6일 전. */
  byDay: number[];
  /** 오늘부터 거꾸로 카운트한 연속 휴식일 (TSS=0). 오늘이 휴식이면 1+. */
  consecutiveRestDays: number;
  /** 오늘부터 거꾸로 카운트한 연속 운동일 (TSS>0). RestDays 와 상호 배타. */
  consecutiveTrainingDays: number;
}

export interface MonthSummary {
  /** 최근 30일 세션 수. */
  sessions: number;
  /** 최근 30일 누적 TSS. */
  totalTss: number;
  /** 주간 평균 TSS (totalTss / 4.3 반올림). */
  avgWeekTss: number;
  /** 30일 시작 시점 CTL. */
  ctlStart: number;
  /** 30일 끝 시점 CTL (= today). */
  ctlEnd: number;
  /** 30일 중 최고 일별 TSS. */
  peakDayTss: number;
  /** 30일 최장 단일 운동 시간 (분). */
  longestDurationMin: number;
  /** 30일 휴식일 수. */
  restDays: number;
}
