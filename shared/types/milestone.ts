/**
 * 러닝 마일스톤 — `users/{uid}/milestones/{milestoneId}` 문서들.
 *
 * 서버(personal-records 트리거)가 거리 완주를 판정해 write 하고, 프론트는 read-only 구독
 * + `celebrated` 필드만 갱신(모달 노출 표시). rules 로 강제한다.
 *
 * ## 스코프 (v1: 거리 완주만)
 * 첫 5km/10km/하프/풀 완주. 이는 개인 기록(`records/power`.run)의 거리별 PR 표가
 * "이전엔 비어 있었는데 이번 활동으로 처음 채워졌다"로 멱등하게 판정된다 — 별도 누적 카운터가
 * 필요 없다. 누적 거리(100/500/1000km)·연속 주 마일스톤은 lifetime 카운터 인프라가 필요해 후속.
 * 1km 는 마일스톤에서 제외(완주 가치가 낮음).
 *
 * 타입·카탈로그는 이 파일(shared, 프론트도 import). 판정 순수 로직은
 * functions/src/analysis/milestone.ts (personal-records 와 같은 타입/계산 분리 관례).
 */
import type { RunDistanceKey } from "./personal-records";

export type MilestoneId =
  | "first_5km" | "first_10km" | "first_half" | "first_full"
  | "cumulative_100km" | "cumulative_500km" | "cumulative_1000km";

export type MilestoneKind = "distance" | "cumulative";

export interface Milestone {
  /** 문서 id 와 동일. */
  id: MilestoneId;
  kind: MilestoneKind;
  /** 달성 활동의 startTime (epoch ms). 표시·정렬용. */
  achievedAt: number;
  /** 달성 활동 id. */
  activityId: string;
  /**
   * 축하 모달이 사용자에게 노출됐는가.
   * 서버는 신규 달성이면 false(축하 대상), 소급분(배포 전 오래된 달성)이면 true(조용)로 쓴다.
   * 프론트가 모달을 띄운 뒤 true 로 갱신(rules 가 이 필드만 허용).
   */
  celebrated: boolean;
  createdAt: number;
}

/** 마일스톤 대상 거리 — 1km 제외(완주 가치 낮음). RunDistanceKey 부분집합. */
export const MILESTONE_DISTANCES: RunDistanceKey[] = ["5km", "10km", "half", "full"];

/** 거리 → 마일스톤 id. */
export const DISTANCE_MILESTONE_ID: Partial<Record<RunDistanceKey, MilestoneId>> = {
  "5km": "first_5km",
  "10km": "first_10km",
  "half": "first_half",
  "full": "first_full",
};

/** 누적 거리 마일스톤 — id → 임계 누적 거리(m). 짧은 순. */
export const CUMULATIVE_MILESTONE_M: Record<"cumulative_100km" | "cumulative_500km" | "cumulative_1000km", number> = {
  cumulative_100km: 100000,
  cumulative_500km: 500000,
  cumulative_1000km: 1000000,
};

/** 소급 판정 창 — 달성 활동이 이보다 오래되면 "조용히 달성 처리"(모달 없음). */
export const MILESTONE_RECENT_WINDOW_MS = 14 * 86400000;

export interface DistanceMilestoneInput {
  /** 이전 PR 표에 이 거리 기록이 있었는가(= 이미 완주). */
  wasAchieved: Partial<Record<RunDistanceKey, boolean>>;
  /** 이번 병합 후 이 거리 기록이 있는가. */
  nowAchieved: Partial<Record<RunDistanceKey, boolean>>;
  activityId: string;
  /** 달성 활동 startTime. celebrated 판정(소급 여부)에 사용. */
  activityStartTime: number;
  nowMs: number;
}

export interface NewMilestone {
  id: MilestoneId;
  kind: MilestoneKind;
  achievedAt: number;
  activityId: string;
  celebrated: boolean;
}
