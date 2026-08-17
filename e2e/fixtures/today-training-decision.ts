const session = {
  sessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa",
  scheduledSessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa",
  scheduledSessionRevision: "ssr_bbbbbbbbbbbbbbbbbbbbbbbb",
  dayRef: { goalId: "goal_e2e", weekId: "week_01", dayIndex: 2, localDate: "2026-08-15" },
  sessionRevision: "ssr_bbbbbbbbbbbbbbbbbbbbbbbb",
  planItemId: "goal_e2e:week_01:2",
  localDate: "2026-08-15",
  baseline: { workout: "tempo", durationMin: 60, targetTss: 70 },
  current: { workout: "tempo", durationMin: 60, targetTss: 70, completed: false },
  status: "scheduled",
  matchedActivityId: null,
  matchConfidence: "none",
} as const;

const recommendation = {
  localDate: "2026-08-15",
  action: "recovery",
  workout: { kind: "recovery", durationMin: 40, zone: "Z1", targetTss: 25 },
  reasonCodes: ["classification_high_load"],
  evidenceIds: ["evidence_load"],
} as const;

const targetRevision = {
  goalId: "goal_e2e", goalHash: `doc_${"1".repeat(32)}`, planRevision: `plan_${"2".repeat(24)}`,
  weeks: [{ weekId: "week_01", hash: `doc_${"3".repeat(32)}` }],
};

function proposal(status: "pending" | "applied" | "declined") {
  return {
    schemaVersion: "coach-change-proposal-v1", proposalId: `proposal_${"4".repeat(24)}`, status,
    source: { checkInRequestId: "018f47a2-3c4d-7abc-8def-000000000201", prescriptionId: "rx_111111111111111111111111",
      factsId: "facts_e2e", snapshotRevision: "snapshot_e2e", rulesVersion: "coach-prescription-rules-v1",
      weeklyCheckInId: "bike_2026-08-11", weeklyCheckInRevision: 1 }, targetRevision,
    changes: [{ weekId: "week_01", dayIndex: 2, localDate: "2026-08-15", action: "recovery",
      before: { action: "follow_plan", workout: { kind: "tempo", durationMin: 60, targetTss: 70 } },
      workout: { kind: "recovery", durationMin: 40, targetTss: 25 }, reasonCodes: ["classification_high_load"],
      evidenceIds: ["evidence_load"] }],
    evidence: [{ evidenceId: "evidence_load", source: "fitness", sourceId: "fitness_current", field: "rolling7dTss",
      value: 330, sourceRevision: "fitness_revision_e2e", asOf: "2026-08-15T00:00:00.000Z" }],
    consent: { policyVersion: "ai-coach-policy-v4", revision: "2026-08-14T00:00:00.000Z" },
    createdAt: "2026-08-15T00:00:00.000Z", expiresAt: "2096-08-15T00:00:00.000Z", providerCalls: 0, quotaConsumed: 0,
  } as const;
}

const receipt = {
  schemaVersion: "coach-change-receipt-v1", proposalId: `proposal_${"4".repeat(24)}`, auditId: `audit_${"5".repeat(24)}`,
  status: "applied", appliedAt: "2026-08-15T00:02:00.000Z", beforeRevision: targetRevision,
  afterRevision: { ...targetRevision, goalHash: `doc_${"6".repeat(32)}` }, providerCalls: 0, quotaConsumed: 0,
} as const;

export type ProposalFixtureState = "pending" | "applied" | "declined" | "stale";

export function coachCapabilitiesE2eEnvelope() {
  return { data: { schemaVersion: "coach-capabilities-v1",
    apiVersions: [{ apiVersion: "v1", capabilityVersion: "p0", requestSchemaVersion: "coach-respond-v1",
      responseSchemaVersion: "coach-response-payload-v1" }], defaultCapabilityVersion: "p0", queryCatalogVersion: "query_e2e",
    factsCatalogVersion: "facts_e2e", answerSchemaVersion: "answer_e2e", answerCatalogVersion: "catalog_e2e",
    progressPlanner: { read: { enabled: true }, proposal: { enabled: true }, confirm: { enabled: true } },
    todayTrainingDecision: { enabled: true, endpoint: "/v1/coach/training-decisions/today", schemaVersion: "today-training-decision-v1",
      policyVersion: "today-training-decision-policy-v1", policyStage: "active", proposal: { enabled: true }, confirm: { enabled: true }, decline: { enabled: true } },
    prescription: { enabled: true, schemaVersion: "coach-prescription-v1", rulesVersion: "coach-prescription-rules-v1",
      checkIn: { enabled: true, endpoint: "/v1/coach/prescription/check-in" } } } };
}

export function proposalRecoveryE2eEnvelope(state: ProposalFixtureState) {
  if (state === "stale") return { status: "error", error: { code: "proposal_revision_changed", retryable: false }, providerCalls: 0, quotaConsumed: 0 };
  const value = proposal(state);
  return { status: "ok", data: { schemaVersion: "coach-change-proposal-recovery-v1",
    source: { prescriptionId: "rx_111111111111111111111111", sourceRequestId: "018f47a2-3c4d-7abc-8def-000000000201" },
    recoveryStatus: state === "declined" ? "inactive" : state, reasonCode: state === "declined" ? "proposal_declined" : null,
    proposal: value, receipt: state === "applied" ? receipt : null, confirmNonce: state === "pending" ? "n".repeat(32) : null,
    rollbackRequestId: state === "applied" ? "018f47a2-3c4d-7abc-8def-000000000202" : null,
    providerCalls: 0, quotaConsumed: 0 }, providerCalls: 0, quotaConsumed: 0 };
}

export type ExecutionFixtureState = "executable" | "reserved" | "in-progress" | "link" | "probable" | "completed" | "error";

export function executionListE2eEnvelope(state: ExecutionFixtureState) {
  if (state === "error") throw new Error("error state uses a failed callable response");
  if (state === "executable") return { data: { executions: [] } };
  const status = state === "reserved" ? "reserved" : state === "in-progress" ? "started" : "linked";
  // 시간창 추정 매칭 — 확인 전에는 완료 권한이 없어 탈출 동선이 반드시 있어야 하는 상태.
  const probable = state === "probable";
  const outcomeStatus = state === "completed" ? "completed" : "pending";
  return { data: { executions: [{ schemaVersion: 1, executionId: `exec_${"7".repeat(24)}`, status,
    scheduledSessionId: session.scheduledSessionId, dayRef: session.dayRef, scheduledSessionRevision: session.scheduledSessionRevision,
    planRevision: "plan_e2e", projectionId: "today_cccccccccccccccccccccccc", prescriptionId: "rx_111111111111111111111111",
    prescriptionValidFrom: "2026-08-14T15:00:00.000Z", proposalId: null, proposalAfterRevision: null, receiptAuditId: null,
    activityId: status === "linked" ? "activity_e2e" : null, activityRevision: status === "linked" ? "activity_revision_e2e" : null,
    discipline: "bike", startedAt: status === "reserved" ? null : 1_787_000_000_200,
    linkedAt: status === "linked" ? 1_787_000_000_300 : null, createdAt: 1_787_000_000_100, updatedAt: 1_787_000_000_300,
    matchMethod: probable ? "legacy-time-window" : status === "linked" ? "manual" : "explicit-start",
    matchConfidence: probable ? "probable" : status === "linked" ? "manual" : "exact",
    outcomeStatus, outcomeAt: state === "completed" ? 1_787_000_000_400 : null, postponedToLocalDate: null }] } };
}

export function todayTrainingDecisionE2eEnvelope(options: { applied?: boolean } = {}) {
  return {
    status: "ok",
    data: {
      schemaVersion: "today-training-decision-v1",
      policyVersion: "today-training-decision-policy-v1",
      policyStage: "active",
      projectionId: "today_cccccccccccccccccccccccc",
      asOfDate: "2026-08-15",
      asOfInstant: 1_787_000_000_000,
      computedAt: 1_787_000_000_100,
      scheduledProjectionValidUntil: 4_000_000_000_000,
      recommendationValidUntil: 4_000_000_000_000,
      proposalExpiresAt: null,
      targetDiscipline: "bike",
      mode: options.applied ? "applied-plan" : "current-recommendation",
      sourceState: "current",
      unavailableReason: null,
      localDate: "2026-08-15",
      timezone: "Asia/Seoul",
      discipline: "bike",
      planSource: { goalId: "goal_e2e", goalRevision: "goal_revision_e2e", planRevision: "plan_e2e",
        weekRevisions: [{ weekId: "week_01", revision: "week_revision_e2e" }] },
      recommendationSource: {
        sourceRequestId: "018f47a2-3c4d-7abc-8def-000000000201",
        prescriptionId: "rx_111111111111111111111111",
        factsId: "facts_e2e",
        snapshotRevision: "snapshot_e2e",
        planRevision: "plan_e2e",
        rulesVersion: "coach-prescription-rules-v1",
        weeklyCheckInId: "bike_2026-08-11",
        weeklyCheckInRevision: 1,
      },
      sourceRefs: { factsId: "facts_e2e", prescriptionId: "rx_111111111111111111111111", snapshotRevision: "snapshot_e2e",
        planRevision: "plan_e2e", rulesVersion: "coach-prescription-rules-v1",
        proposalId: options.applied ? `proposal_${"4".repeat(24)}` : null,
        receiptAuditId: options.applied ? `audit_${"5".repeat(24)}` : null },
      prescription: { status: "ready", missingSignals: [], requiredSignals: [], validFrom: "2026-08-14T15:00:00.000Z",
        validUntil: "2096-08-15T15:00:00.000Z" },
      healthGate: { state: "clear", reasonCodes: [], sourceFreshness: "current" },
      freshness: { asOf: "2026-08-15T00:00:00.000Z", generatedAt: "2026-08-15T00:01:00.000Z",
        validUntil: "2096-08-15T15:00:00.000Z", stale: false },
      scheduledSessions: [session],
      recommendedAdjustments: [{ sessionId: session.sessionId, recommendation }],
      effectiveSessions: [{ ...session, ...(options.applied ? { current: { workout: "recovery", durationMin: 40, targetTss: 25, completed: false },
        basis: "applied_proposal", appliedProposalId: `proposal_${"4".repeat(24)}` } : { basis: "scheduled", appliedProposalId: null }) }],
      representativeSessionId: session.sessionId,
      proposal: options.applied ? { proposalId: `proposal_${"4".repeat(24)}`, status: "applied",
        expiresAt: "2096-08-15T00:00:00.000Z", confirmNonce: null } : null,
      receipt: options.applied ? receipt : null,
      capabilities: {
        consent: "granted", prescriptionRead: "available", checkIn: "available", proposal: "available",
        confirm: "available", decline: "available", rollback: "available", explain: "available",
        execution: { reserve: "available", start: "available", link: "available", unlink: "available", status: "available", outcome: "available" },
      },
      plan: { goalId: "goal_e2e", phase: "build", scheduledSessions: [session] },
      loadAdjustment: { prescriptionStatus: "ready", classification: "high_load",
        reasonCodes: ["classification_high_load"], recommendations: [{ sessionId: session.sessionId, recommendation }] },
      load: { rolling7dTss: 330, calendarWeekActualTssAsOf: 205, calendarWeekPlannedTss: 220,
        targetWeekTss: [205, 222], weeklyLoadComparison: "on-target", unavailableReason: null },
      coachCore: { weeklyCheckInId: "bike_2026-08-11", weeklyCheckInRevision: 1, requiredSignals: [], proposalStatus: null,
        sourceRequestId: "018f47a2-3c4d-7abc-8def-000000000201" },
      sources: { loadScopesUsed: ["bike"], observedScopes: ["bike"], coverage: "complete", lastActivityIngestAt: 1_787_000_000_000 },
      fallback: { active: false, reasonCode: null },
      providerCalls: 0,
      quotaConsumed: 0,
    },
    providerCalls: 0,
    quotaConsumed: 0,
  };
}
