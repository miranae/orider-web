/**
 * canonical 훈련 결정(`getTrainingDecision`) 계약 (#886 — 에픽 app#2237 의 L).
 *
 * 서버 원본은 `orider-g1-web/shared/types/training-decision.ts` + `functions/src/training/training-decision.ts`
 * (callable `getTrainingDecision`, last-known-good 문서 `users/{uid}/training/decision_{discipline}`).
 *
 * ## 이 파일이 없애는 것
 *
 * 웹은 `utils/trainingStatusLabel.ts` 가 TSB 를 5구간으로 **직접 판정**해 왔다. 앱·서버도 각자
 * 경계를 들고 있었고, 같은 TSB 가 화면마다 다른 상태로 읽혔다. 이제 서버 `form.band` 만 읽고
 * 클라이언트는 라벨만 매핑한다.
 *
 * ## 파싱 규칙 두 가지
 *
 * 1. **모르는 enum 값으로 파싱을 깨지 않는다.** 서버가 먼저 배포되어 새 `type`/`band`/`severity`
 *    가 내려와도 봉투 전체를 버리면 화면이 통째로 빈다. 그래서 열거형은 `z.string()` 으로 받고,
 *    아는 값인지는 `knownFormBandKey` 같은 **좁히기 헬퍼**로 표시 시점에 판단한다.
 * 2. **모든 객체는 열려 있다(non-strict).** 서버가 필드를 더해도 웹은 무시하고 계속 그린다 —
 *    `.strict()` 는 서버 선행 배포를 곧바로 장애로 만든다.
 *
 * 값이 없으면 `null` 이다. 0 으로 대체하지 않는다(#2434).
 */
import { z } from "zod";
import { CANONICAL_STATUSES, type CanonicalEnvelope, type CanonicalStatus } from "@shared/types/canonical";
import { knownFormBandKey, type FormBandKey } from "@shared/training/formBand";

/** 아는 값이면 그대로, 모르면 null. 열거형을 좁힐 때 쓴다. */
export function knownEnumValue<T extends string>(known: readonly T[], value: string | null | undefined): T | null {
  if (typeof value !== "string") return null;
  return (known as readonly string[]).includes(value) ? (value as T) : null;
}

export const DECISION_DISCIPLINES = ["bike", "run", "swim"] as const;
export type DecisionDiscipline = (typeof DECISION_DISCIPLINES)[number];

export const DECISION_RECOMMENDATION_TYPES = [
  "burnout-rest", "recovery", "endurance", "tempo", "threshold", "vo2", "taper",
] as const;
export type DecisionRecommendationType = (typeof DECISION_RECOMMENDATION_TYPES)[number];

export const FEASIBILITY_LABELS = ["easy", "on_track", "stretch", "risky"] as const;
export const ADAPTATION_SEVERITIES = ["info", "warn", "critical"] as const;
export const READINESS_BANDS = ["poor", "fair", "good", "optimal"] as const;
export const BALANCE_PHASES = ["base", "build", "maintain", "taper", "recovery"] as const;

const finiteNumber = z.number().finite();
const range = z.tuple([finiteNumber, finiteNumber]);
/** 열거형 자리. 값은 문자열로 받고 좁히기는 표시 시점에 한다(위 규칙 1). */
const openEnum = z.string().min(1).max(64);

const decisionInputsSchema = z.object({
  asOfDay: finiteNumber,
  timezone: z.string().min(1).max(100),
  discipline: openEnum,
  fitnessRevision: z.string().nullable(),
  trainingSummaryRevision: z.string().nullable(),
  goalUpdatedAt: finiteNumber.nullable(),
  planUpdatedAt: finiteNumber.nullable(),
  readinessObservedAt: finiteNumber.nullable(),
  pendingActivityCount: z.number().int().nonnegative(),
});

const decisionRecommendationSchema = z.object({
  type: openEnum,
  zone: z.number().int().min(1).max(5),
  durationMin: range,
  inputSnapshot: z.object({
    tsb: finiteNumber, ctl: finiteNumber, atl: finiteNumber, recent7dTss: finiteNumber,
    discipline: openEnum, daysUntilGoal: finiteNumber.optional(),
  }),
  weeklyTargetTss: range.optional(),
  remainingTss: finiteNumber.optional(),
  balanceGuide: z.object({ lo: finiteNumber, hi: finiteNumber, phase: openEnum }).optional(),
});

const formBandSchema = z.object({
  key: openEnum,
  index: z.number().int().min(0),
  drivenByRamp: z.boolean(),
});

const decisionFormSchema = z.object({
  tsb: finiteNumber,
  ctl: finiteNumber,
  atl: finiteNumber,
  /** 모르면 null — 램프 승격 규칙을 건너뛴다. 0 이 아니다. */
  ctlRampPerWeek: finiteNumber.nullable(),
  band: formBandSchema,
});

const decisionGoalSchema = z.object({
  goalId: z.string().min(1),
  daysUntil: z.number().int().nullable(),
  feasibility: openEnum.nullable(),
  weekProgress: z.object({
    completed: z.number().int().nonnegative(), total: z.number().int().nonnegative(),
  }).nullable(),
  todayPlan: z.object({
    workout: z.string(), workoutName: z.string().nullable(), plannedTss: finiteNumber,
    completed: z.boolean(), weekNumber: z.number().int(), phase: z.string(),
  }).nullable(),
  compliance: z.object({
    recent4wRatio: finiteNumber, severity: openEnum, reason: z.string(),
  }).nullable(),
  projectionRevision: z.string().nullable(),
});

const readinessSchema = z.object({
  score: finiteNumber,
  band: openEnum,
  factors: z.object({
    hrv: finiteNumber.optional(), rhr: finiteNumber.optional(), sleep: finiteNumber.optional(),
  }),
});

export const trainingDecisionSchema = z.object({
  inputs: decisionInputsSchema,
  recommendation: decisionRecommendationSchema,
  form: decisionFormSchema,
  /** 활성 목표가 없으면 null. "목표 없음" 은 진척 0 이 아니다. */
  goal: decisionGoalSchema.nullable(),
  /** 준비도 입력이 없으면 null. */
  readiness: readinessSchema.nullable(),
  decisionRevision: z.string().min(1),
});

export type TrainingDecision = z.infer<typeof trainingDecisionSchema>;

export const trainingDecisionEnvelopeSchema = z.object({
  schemaVersion: z.number().int(),
  algorithmVersion: z.string().min(1),
  status: openEnum,
  computedAt: finiteNumber.nullable(),
  inputRevision: z.string().nullable(),
  inputDigest: z.string().nullable(),
  period: z.unknown().nullable().optional(),
  data: trainingDecisionSchema.nullable(),
  error: z.object({ code: z.string(), retryable: z.boolean(), message: z.string().optional() }).nullable(),
});

export type TrainingDecisionEnvelope = CanonicalEnvelope<TrainingDecision>;

/**
 * 봉투를 판다. 모르는 status 는 `failed` 로 떨어뜨린다 — 모르는 상태를 canonical 로 낙관하면
 * 낡은 값이 최신처럼 그려진다.
 */
export function parseTrainingDecisionEnvelope(value: unknown): TrainingDecisionEnvelope {
  const parsed = trainingDecisionEnvelopeSchema.parse(value);
  const status: CanonicalStatus = knownEnumValue(CANONICAL_STATUSES, parsed.status) ?? "failed";
  return {
    schemaVersion: parsed.schemaVersion,
    algorithmVersion: parsed.algorithmVersion,
    status,
    computedAt: parsed.computedAt,
    inputRevision: parsed.inputRevision,
    inputDigest: parsed.inputDigest,
    period: null,
    data: parsed.data,
    error: parsed.error
      ?? (status === "failed" ? { code: "unknown_status", retryable: true, message: parsed.status } : null),
  };
}

/** 서버 Form 구간 키. 모르는 값이면 null — 로컬 판정으로 대체하지 않는다. */
export function decisionFormBandKey(decision: TrainingDecision | null | undefined): FormBandKey | null {
  if (!decision) return null;
  return knownFormBandKey(decision.form.band.key);
}
