import { describe, expect, it } from "vitest";

import {
  DECISION_RECOMMENDATION_TYPES,
  FEASIBILITY_LABELS,
  decisionFormBandKey,
  knownEnumValue,
  parseTrainingDecisionEnvelope,
  type TrainingDecision,
} from "./trainingDecisionCanonicalContract";

/**
 * 골든 — 서버 `shared/types/training-decision.ts` 의 `TrainingDecision` **모든 필드**를 채운다.
 * 서버가 필드를 지우거나 이름을 바꾸면 아래 KEY 목록 검사가 먼저 깨진다.
 */
function golden(): TrainingDecision {
  return {
    inputs: {
      asOfDay: 1_756_000_000_000,
      timezone: "Asia/Seoul",
      discipline: "bike",
      fitnessRevision: "fit_1",
      trainingSummaryRevision: "sum_1",
      goalUpdatedAt: 1_755_000_000_000,
      planUpdatedAt: 1_755_100_000_000,
      readinessObservedAt: null,
      pendingActivityCount: 0,
    },
    recommendation: {
      type: "endurance",
      zone: 2,
      durationMin: [60, 90],
      inputSnapshot: { tsb: -8.2, ctl: 62.1, atl: 70.3, recent7dTss: 430, discipline: "bike", daysUntilGoal: 42 },
      weeklyTargetTss: [400, 520],
      remainingTss: 120,
      balanceGuide: { lo: 400, hi: 520, phase: "build" },
    },
    form: { tsb: -8.2, ctl: 62.1, atl: 70.3, ctlRampPerWeek: 3.4, band: { key: "productive", index: 2, drivenByRamp: false } },
    goal: {
      goalId: "goal_1",
      daysUntil: 42,
      feasibility: "on_track",
      weekProgress: { completed: 3, total: 5 },
      todayPlan: { workout: "z2", workoutName: "지구력 라이드", plannedTss: 85, completed: false, weekNumber: 6, phase: "build" },
      compliance: { recent4wRatio: 0.82, severity: "info", reason: "plan_followed" },
      projectionRevision: "proj_1",
    },
    readiness: { score: 71, band: "good", factors: { hrv: 74, rhr: 68, sleep: 70 } },
    decisionRevision: "training-decision@1#day=1756000000000|tz=Asia/Seoul",
  };
}

function envelope(data: TrainingDecision | null, status: string) {
  return {
    schemaVersion: 1,
    algorithmVersion: "training-decision@1",
    status,
    computedAt: data ? 1_756_000_100_000 : null,
    inputRevision: data ? "day=1756000000000" : null,
    inputDigest: data ? "d1" : null,
    period: null,
    data,
    error: status === "failed" ? { code: "compute_failed", retryable: true } : null,
  };
}

describe("trainingDecisionCanonicalContract", () => {
  it("골든 봉투를 손실 없이 판다", () => {
    const parsed = parseTrainingDecisionEnvelope(envelope(golden(), "canonical"));
    expect(parsed.status).toBe("canonical");
    expect(parsed.data).toEqual(golden());
  });

  it("TrainingDecision 최상위 필드가 서버 계약과 같다", () => {
    expect(Object.keys(golden()).sort()).toEqual(
      ["decisionRevision", "form", "goal", "inputs", "readiness", "recommendation"],
    );
    expect(Object.keys(golden().form).sort()).toEqual(["atl", "band", "ctl", "ctlRampPerWeek", "tsb"]);
    expect(Object.keys(golden().goal!).sort()).toEqual(
      ["compliance", "daysUntil", "feasibility", "goalId", "projectionRevision", "todayPlan", "weekProgress"],
    );
    expect(Object.keys(golden().inputs).sort()).toEqual(
      ["asOfDay", "discipline", "fitnessRevision", "goalUpdatedAt", "pendingActivityCount",
       "planUpdatedAt", "readinessObservedAt", "timezone", "trainingSummaryRevision"],
    );
  });

  it("모르는 열거형 값으로 파싱이 깨지지 않는다 (서버 선행 배포)", () => {
    const future = golden();
    future.recommendation.type = "polarized_block";
    future.form.band = { key: "sharpening", index: 5, drivenByRamp: false };
    future.goal!.feasibility = "unattainable";
    const parsed = parseTrainingDecisionEnvelope(envelope(future, "canonical"));
    expect(parsed.data?.recommendation.type).toBe("polarized_block");
    // 모르는 구간은 좁히기에서 null 이 된다 — 화면은 로컬 판정으로 대체하지 않고 상태를 밝힌다.
    expect(decisionFormBandKey(parsed.data)).toBeNull();
    expect(knownEnumValue(FEASIBILITY_LABELS, parsed.data?.goal?.feasibility)).toBeNull();
    expect(knownEnumValue(DECISION_RECOMMENDATION_TYPES, "endurance")).toBe("endurance");
  });

  it("서버가 필드를 더해도 무시하고 계속 판다", () => {
    const payload = envelope(golden(), "canonical") as Record<string, unknown>;
    (payload.data as Record<string, unknown>).nextField = { anything: true };
    payload.futureEnvelopeField = 1;
    expect(parseTrainingDecisionEnvelope(payload).data?.decisionRevision).toBe(golden().decisionRevision);
  });

  it("stale 은 값을 그대로 준다", () => {
    const parsed = parseTrainingDecisionEnvelope(envelope(golden(), "stale"));
    expect(parsed.status).toBe("stale");
    expect(parsed.data?.form.band.key).toBe("productive");
  });

  it("값 없는 상태는 data 가 null 이고 0 으로 채우지 않는다", () => {
    for (const status of ["processing", "unavailable"]) {
      const parsed = parseTrainingDecisionEnvelope(envelope(null, status));
      expect(parsed.data).toBeNull();
      expect(parsed.status).toBe(status);
    }
  });

  it("모르는 status 는 failed 로 떨어뜨린다 — canonical 로 낙관하지 않는다", () => {
    const parsed = parseTrainingDecisionEnvelope(envelope(null, "recomputing"));
    expect(parsed.status).toBe("failed");
    expect(parsed.error?.code).toBe("unknown_status");
  });

  it("ctlRampPerWeek 을 모르면 null 이다 (0 이 아니다)", () => {
    const unknownRamp = golden();
    unknownRamp.form.ctlRampPerWeek = null;
    expect(parseTrainingDecisionEnvelope(envelope(unknownRamp, "canonical")).data?.form.ctlRampPerWeek).toBeNull();
  });
});
