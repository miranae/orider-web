import { describe, expect, it } from "vitest";
import { parseCoachV2Response } from "./coachV2Contract";

const evidence = { evidenceId: "ev_distance", source: "derived", sourceId: "slot_distance", field: "value", value: 42,
  sourceRevision: "revision_1", asOf: "2026-07-18T03:00:00.000Z", ownerScope: "authenticated_user" };
const baseBlock = { blockId: "block_distance", sourceSlotIds: ["slot_distance"], partial: false, stale: false, truncated: false, omittedCount: 0 };
const answer = {
  schemaVersion: "coach-answer-document-v1", catalogVersion: "coach-answer-block-catalog-v1", answerId: "answer_1", sourceFactsId: "facts_1",
  questionSummary: "coach.answer.summary.distance", status: "complete", blocks: [{ ...baseBlock, kind: "metric_grid",
    items: [{ metricId: "distance", current: { value: 42, unit: "kilometers", evidenceId: evidence.evidenceId } }] }],
  evidence: [evidence], warnings: [], freshness: { asOf: evidence.asOf, timezone: "Asia/Seoul", staleSourceSlotIds: [] }, followUps: [],
};
const envelope = {
  apiVersion: "v2", capabilityVersion: "p1", schemaVersion: "coach-response-envelope-v1",
  requestId: "018f47a2-3c4d-7abc-8def-000000000101", outcome: "answer", answer,
  quota: { limit: 3, remaining: 2, resetAt: "2026-07-18T15:00:00.000Z", consumed: true },
  budget: { blocked: false, providerCalls: 0, inputTokens: 0, outputTokens: 0 },
  retry: { mode: "same_request_replay", quotaImpact: "none", previousTurnConsumed: true, providerCallAllowed: false, retryable: false, reasonCode: "completed" },
  execution: { parser: "deterministic", queryPlanHash: "hash_1", catalogVersion: "coach-query-catalog-v1", factsId: "facts_1", asOf: evidence.asOf },
};

describe("coachV2Contract", () => {
  it("parses the explicit P1 tuple and preserves exact evidence-bound values", () => {
    const parsed = parseCoachV2Response({ data: envelope });
    expect(parsed.outcome).toBe("answer");
    expect(parsed.answer?.blocks[0]).toMatchObject({ kind: "metric_grid", items: [{ current: { value: 42, evidenceId: "ev_distance" } }] });
  });

  it("accepts the strict load-analysis projection and fails closed on nested evidence drift", () => {
    const records: typeof evidence[] = [];
    let index = 0;
    const value = (raw: number | string | boolean) => {
      const record = { ...evidence, evidenceId: `ev_load_${++index}`, source: "load_analysis", sourceId: "load_facts_1", value: raw };
      records.push(record); return { value: raw, evidenceId: record.evidenceId };
    };
    const metricSet = (ctl: number, atl: number, form: number) => ({ ctl: value(ctl), atl: value(atl), form: value(form) });
    const currentMetrics = metricSet(51, 62, -11);
    const goalTarget = value(40); const goalCurrent = value(51); const goalAchieved = value(true);
    const bands = [
      { id: "recovery_review", metric: "form", maxExclusive: value(-30), classification: "recovery_review_recommended",
        labelKey: "coach.load.band.recovery_review.label", explanationKey: "coach.load.band.recovery_review.explanation", referenceId: "ai-coach-load-policy-2026-07" },
      { id: "high_load", metric: "form", minInclusive: value(-30), maxExclusive: value(-20), classification: "high_load",
        labelKey: "coach.load.band.high_load.label", explanationKey: "coach.load.band.high_load.explanation", referenceId: "ai-coach-load-policy-2026-07" },
      { id: "productive_load", metric: "form", minInclusive: value(-20), maxExclusive: value(-10), classification: "productive_load",
        labelKey: "coach.load.band.productive_load.label", explanationKey: "coach.load.band.productive_load.explanation", referenceId: "ai-coach-load-policy-2026-07" },
      { id: "normal", metric: "form", minInclusive: value(-10), classification: "normal",
        labelKey: "coach.load.band.normal.label", explanationKey: "coach.load.band.normal.explanation", referenceId: "ai-coach-load-policy-2026-07" },
    ];
    const loadBlock = { ...baseBlock, blockId: "load", kind: "load_analysis", assessment: {
      schemaVersion: "coach-load-assessment-v1", capabilityVersion: "p1", factsId: "load_facts_1", asOf: value(evidence.asOf),
      timezone: "Asia/Seoul", discipline: "bike", sourceDateConvention: "utc_calendar_day",
      current: currentMetrics, previousComparable: metricSet(46, 54, -8), delta: metricSet(5, 8, -3),
      comparisonBasis: "canonical_utc_day_7d_delta", weeklyTss: { basis: "user_local_monday_to_as_of",
        current: value(214), previousComparable: value(180), delta: value(34) },
      weeklyTrend: [{ weekId: "2026-W29", period: { fromCanonicalDate: value("2026-07-13"), toCanonicalDate: value("2026-07-18") },
        partial: true, sampleBasis: "current_as_of", ctl: value(51), atl: value(62), form: value(-11) }], drivers: [],
      goalAssessment: { goalId: "goal_ctl", type: "ctl_target", target: goalTarget, current: goalCurrent, achieved: goalAchieved,
        evidenceIds: [goalTarget.evidenceId, goalCurrent.evidenceId, goalAchieved.evidenceId] },
      bandAssessment: { catalogVersion: "form-band-catalog-v1", bands, currentBandId: "productive_load", currentValue: currentMetrics.form },
      classification: "productive_load", reasonCodes: ["classification_productive_load"], confidence: "medium", missingSignals: [],
    } };
    const parsed = parseCoachV2Response({ data: { ...envelope, answer: { ...answer, blocks: [loadBlock], evidence: records } } });
    expect(parsed.answer?.blocks[0]).toMatchObject({ kind: "load_analysis", assessment: { current: { ctl: { value: 51 } },
      comparisonBasis: "canonical_utc_day_7d_delta" } });
    const drifted = structuredClone(loadBlock);
    drifted.assessment.weeklyTrend[0].ctl.value = 999;
    const failed = parseCoachV2Response({ data: { ...envelope, answer: { ...answer, blocks: [drifted], evidence: records } } });
    expect(failed.answer?.blocks[0]).toEqual({ kind: "unsupported_block", blockId: "load", reason: "invalid_block" });

    for (const mutate of [
      (block: typeof loadBlock) => { block.assessment.bandAssessment.catalogVersion = "invented"; },
      (block: typeof loadBlock) => { block.assessment.bandAssessment.bands[0].referenceId = "invented"; },
      (block: typeof loadBlock) => { block.assessment.bandAssessment.currentBandId = "invented"; },
      (block: typeof loadBlock) => { block.assessment.goalAssessment.evidenceIds = []; },
      (block: typeof loadBlock) => { block.assessment.goalAssessment.evidenceIds.reverse(); },
      (block: typeof loadBlock) => { block.assessment.bandAssessment.currentBandId = "normal"; },
      (block: typeof loadBlock) => { block.assessment.bandAssessment.currentValue = value(-12); },
    ]) {
      const tampered = structuredClone(loadBlock); mutate(tampered);
      const result = parseCoachV2Response({ data: { ...envelope, answer: { ...answer, blocks: [tampered], evidence: records } } });
      expect(result.answer?.blocks[0]).toEqual({ kind: "unsupported_block", blockId: "load", reason: "invalid_block" });
    }
    const thresholdTampered = structuredClone(loadBlock);
    const boundary = thresholdTampered.assessment.bandAssessment.bands[0].maxExclusive;
    boundary.value = -31;
    const thresholdRecords = structuredClone(records);
    const boundaryRecord = thresholdRecords.find((item) => item.evidenceId === boundary.evidenceId)!;
    boundaryRecord.value = -31;
    const thresholdResult = parseCoachV2Response({ data: { ...envelope,
      answer: { ...answer, blocks: [thresholdTampered], evidence: thresholdRecords } } });
    expect(thresholdResult.answer?.blocks[0]).toEqual({ kind: "unsupported_block", blockId: "load", reason: "invalid_block" });
  });

  it("replaces unknown, malformed, prescription and evidence-mismatched blocks without retaining raw payload", () => {
    const blocks = [
      { ...baseBlock, blockId: "unknown", kind: "html", html: "<script>private()</script>" },
      { ...baseBlock, blockId: "malformed", kind: "metric_grid", items: "not-an-array", private: "secret" },
      { ...baseBlock, blockId: "rx", kind: "prescription", prescription: { raw: "do not expose" } },
      { ...baseBlock, blockId: "mismatch", kind: "metric_grid", items: [{ metricId: "distance", current: { value: 99, evidenceId: "ev_distance" } }] },
    ];
    const parsed = parseCoachV2Response({ data: { ...envelope, answer: { ...answer, blocks } } });
    expect(parsed.answer?.blocks).toEqual([
      { kind: "unsupported_block", blockId: "unknown", reason: "unknown_kind" },
      { kind: "unsupported_block", blockId: "malformed", reason: "invalid_block" },
      { kind: "unsupported_block", blockId: "rx", reason: "prescription_feature_disabled" },
      { kind: "unsupported_block", blockId: "mismatch", reason: "invalid_block" },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("<script>");
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(JSON.stringify(parsed)).not.toContain("do not expose");
  });

  it("safely replaces an unknown AnswerDocument schema instead of exposing its blocks", () => {
    const parsed = parseCoachV2Response({ data: { ...envelope, answer: { ...answer, schemaVersion: "future-v99",
      blocks: [{ ...baseBlock, kind: "html", html: "raw-private-payload" }] } } });
    expect(parsed.answer).toMatchObject({ compatibility: "unsupported_schema", blocks: [{ kind: "unsupported_block" }] });
    expect(JSON.stringify(parsed)).not.toContain("raw-private-payload");
  });

  it("accepts a signed free continuation clarification and rejects inconsistent quota/budget/outcomes", () => {
    const clarification = { ...envelope, outcome: "clarification_required", answer: undefined,
      execution: { parser: "deterministic", asOf: evidence.asOf },
      clarification: { clarificationId: "clarify_1", promptKey: "coach.clarification.time_range",
        options: [{ optionId: "this_week", labelKey: "coach.clarification.this_week" }], turnToken: "x".repeat(32),
        expiresAt: "2026-07-18T03:15:00.000Z", resolutionMode: "continue_no_charge", consumesQuota: false, providerCalls: 0,
        reasonCode: "time_range_required" } };
    expect(parseCoachV2Response({ data: clarification }).clarification?.resolutionMode).toBe("continue_no_charge");
    expect(() => parseCoachV2Response({ data: { ...clarification, clarification: { ...clarification.clarification, turnToken: "short" } } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...clarification, clarification: { ...clarification.clarification,
      options: [clarification.clarification.options[0], clarification.clarification.options[0]] } } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...clarification, clarification: { ...clarification.clarification,
      resolutionMode: "new_turn_required", turnToken: "not-empty" } } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...envelope, quota: { ...envelope.quota, consumed: false } } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...envelope, budget: { ...envelope.budget, inputTokens: 1 } } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...envelope, outcome: "unsupported" } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...envelope, execution: { ...envelope.execution, factsId: "other_facts" } } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...envelope, execution: { ...envelope.execution, parser: "provider" } } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...envelope, retry: { ...envelope.retry, retryable: true } } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...clarification,
      execution: { parser: "deterministic", queryPlanHash: "leaked_partial_provenance", asOf: evidence.asOf } } })).toThrow();
  });

  it("rejects invalid action/entity combinations and replacement occurredAt evidence drift block-locally", () => {
    const activity = { entityType: "activity", entityId: "activity_1",
      label: { value: "Ride", evidenceId: "ev_label" } };
    const actionBlocks = [
      { ...baseBlock, blockId: "missing_entity", kind: "action", actionCode: "OPEN_ACTIVITY" },
      { ...baseBlock, blockId: "extra_entity", kind: "action", actionCode: "VIEW_TRAINING_LOAD", entity: activity },
    ];
    const actionEvidence = { ...evidence, evidenceId: "ev_label", value: "Ride" };
    const parsedActions = parseCoachV2Response({ data: { ...envelope, answer: { ...answer,
      blocks: actionBlocks, evidence: [evidence, actionEvidence] } } });
    expect(parsedActions.answer?.blocks).toEqual([
      { kind: "unsupported_block", blockId: "missing_entity", reason: "invalid_block" },
      { kind: "unsupported_block", blockId: "extra_entity", reason: "invalid_block" },
    ]);

    const replacement = { ...baseBlock, blockId: "replacement", kind: "plan_adherence",
      planned: { value: 1, evidenceId: "ev_planned" }, completed: { value: 1, evidenceId: "ev_completed" }, missed: [],
      replacements: [{ planned: { ...activity, entityType: "plan_item", occurredAt: { value: "wrong", evidenceId: "ev_at" } },
        actual: activity, evidenceIds: ["ev_label"] }] };
    const evidenceRecords = [
      { ...evidence, evidenceId: "ev_planned", value: 1 }, { ...evidence, evidenceId: "ev_completed", value: 1 },
      actionEvidence, { ...evidence, evidenceId: "ev_at", value: "2026-07-18T03:00:00.000Z" },
    ];
    const parsedReplacement = parseCoachV2Response({ data: { ...envelope, answer: { ...answer,
      blocks: [replacement], evidence: evidenceRecords } } });
    expect(parsedReplacement.answer?.blocks[0]).toEqual({ kind: "unsupported_block", blockId: "replacement", reason: "invalid_block" });
  });

  it.each(["quota_exceeded", "budget_blocked"] as const)("binds %s fallbackAvailable to partial answer presence", (outcome) => {
    const failure = { ...envelope, outcome, answer: undefined,
      quota: { ...envelope.quota, remaining: outcome === "quota_exceeded" ? 0 : 3, consumed: false },
      budget: { ...envelope.budget, blocked: outcome === "budget_blocked" },
      retry: { ...envelope.retry, previousTurnConsumed: false, retryable: false, reasonCode: outcome },
      execution: { parser: "deterministic", asOf: evidence.asOf },
      error: { code: outcome, retryable: false, fallbackAvailable: false } };
    expect(parseCoachV2Response({ data: failure }).outcome).toBe(outcome);
    expect(() => parseCoachV2Response({ data: { ...failure,
      error: { ...failure.error, fallbackAvailable: true } } })).toThrow();
    expect(() => parseCoachV2Response({ data: { ...failure,
      answer: { ...answer, status: "partial" } } })).toThrow();
    expect(parseCoachV2Response({ data: { ...failure,
      answer: { ...answer, status: "partial" }, error: { ...failure.error, fallbackAvailable: true } } }).answer?.status).toBe("partial");
  });
});
