/**
 * 데이터 충분도 블록 — 기능이 열리려면 무엇이 얼마나 필요하고 지금 얼마나 모였는지.
 *
 * 기획 정본: orider-doc/planning/RESULT_데이터충분도.md (C2.11).
 *
 * ## 누가 만드나
 *
 * **그 지표를 계산하는 같은 실행**이 함께 만든다(소유 산출물 동반 산출). 충분도 전용
 * 계산기·문서·트리거는 없다. 읽는 쪽(웹·앱·코치)은 이 블록을 **모으고 전달만** 한다 —
 * 상태를 다시 판정하거나 요건 수치를 더하지 않는다.
 *
 * ## 문구
 *
 * 블록은 문구를 싣지 않는다. 표시 층이 `featureId`·`requirementId`·`kind`·`guarantee` 로
 * 정적 어휘를 고른다(ko·en). 수치는 `target`·`current` 의 단위 값 그대로 쓴다.
 * 품질 조건(`guarantee: "unpredictable"`)에는 수치를 싣지 않는다 — r²·신뢰도 같은 내부
 * 지표를 사용자에게 보여 주지 않기 위해서다.
 */

/** 상태 우선순위(겹치면 앞이 이김): not_applicable > delayed > processing > locked > low_evidence > open. */
export type SufficiencyState =
  | "open"
  | "low_evidence"
  | "locked"
  | "processing"
  | "delayed"
  | "not_applicable";

/**
 * 요건을 채웠을 때 무엇을 약속할 수 있는가.
 * - sufficient: 그 요건 하나만 남았다면 채우면 열린다.
 * - minimum: 최소 조건이다. 채워도 열린다고 약속하지 않는다.
 * - unpredictable: 채울 기준을 수치로 말할 수 없다(적합도·신뢰도).
 */
export type SufficiencyGuarantee = "sufficient" | "minimum" | "unpredictable";

export type SufficiencyRequirementKind =
  | "input" | "count" | "channel" | "period"
  | "quality" | "eligibility" | "freshness" | "self_report";

export type SufficiencyExclusionReason = "virtual_power" | "metrics_pending";

export interface SufficiencyAmount {
  value: number;
  /** activity | point | ride_1h | kg … 표시 층이 단위 어휘로 바꾼다. */
  unit: string;
}

export interface SufficiencyRequirement {
  requirementId: string;
  kind: SufficiencyRequirementKind;
  satisfaction: "met" | "not_met";
  guarantee: SufficiencyGuarantee;
  /** unpredictable 에는 싣지 않는다. */
  target?: SufficiencyAmount;
  current?: SufficiencyAmount;
  /** 이번 계산에서 빠진 입력. 개수와 사유만 싣는다(활동 id 없음). */
  excluded?: Array<{ reason: SufficiencyExclusionReason; count: number }>;
}

export type SufficiencyActionCode =
  | "input_weight"
  | "confirm_weight"
  | "connect_power_meter"
  | "record_power_ride"
  | "ride_effort_3_20min"
  | "ride_long_1h"
  | "ride_varied_efforts"
  | "wait_analysis";

export interface SufficiencyBlock {
  featureId: string;
  viewId: string;
  discipline: "bike" | "run" | "swim";
  state: SufficiencyState;
  requirements: SufficiencyRequirement[];
  /** 충족이 확인되지 않은 요건 수. owner 가 센 값이며 표시 층이 다시 세지 않는다. */
  remainingRequirementCount: number;
  nextAction: { code: SufficiencyActionCode } | null;
  /**
   * 값의 근거. `assumedInputs` 가 있으면 그 입력은 사용자가 정한 값이 아니다(기기 기본값 등) —
   * 결과는 체험용이며 「가정값」 칩과 입력 행동을 함께 보여야 한다.
   */
  source: { basis: "measured" | "profile"; assumedInputs: string[] };
}

export interface SufficiencySet {
  schemaVersion: 1;
  catalogVersion: string;
  /** 이 블록들을 만든 소유 산출물. */
  ownerOutput: string;
  /**
   * 계측용 불투명 주체 키(서버 `canonicalOwnerResultId`). 노출 이벤트(웹)와 해제 로그(서버)를
   * 원시 uid 없이 잇는다. 소유자 전용 문서에만 실린다.
   */
  subjectKey: string;
  /** 계산에 쓴 기록의 기준 시점(이 시각 이전 기록만 반영). */
  asOf: number;
  computedAt: number;
  /**
   * 이 시각이 지나면 표시 층은 상태를 「지연」으로 바꾼다 — 읽기 쪽에 허용된 유일한 시간 규칙.
   * owner 가 기존 경계·기한으로 정할 수 없으면 null(시간 경과로 상태가 바뀌지 않음).
   */
  staleAfter: number | null;
  /** 블록 내용의 결정적 digest. 같은 입력이면 같다(쓰기 생략·전이 판정에 쓴다). */
  digest: string;
  blocks: SufficiencyBlock[];
}

export const SUFFICIENCY_SCHEMA_VERSION = 1 as const;
