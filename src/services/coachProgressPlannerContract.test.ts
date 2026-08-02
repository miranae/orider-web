import { describe, expect, it } from "vitest";
import {
  coachProposalConfirmRequestSchema, coachProposalRollbackRequestSchema,
  parseCoachProgressPlannerCapabilities, parseCoachProposalCreateResponse, parseCoachProposalResponse,
  parseCoachProposalRecoveryResponse, parseCoachReceiptResponse,
} from "./coachProgressPlannerContract";

const revision = { goalId: "goal-1", goalHash: `doc_${"a".repeat(32)}`,
  planRevision: `plan_${"b".repeat(24)}`, weeks: [{ weekId: "week-1", hash: `doc_${"c".repeat(32)}` }] };
const evidence = { evidenceId: "ev-1", source: "plan", sourceId: "bounded", field: "target_tss", value: 50,
  sourceRevision: "source-r1", asOf: "2026-07-20T00:00:00.000Z" };
const proposal = { schemaVersion: "coach-change-proposal-v1", proposalId: `proposal_${"d".repeat(24)}`,
  status: "pending", source: { checkInRequestId: "018f47a2-3c4d-7abc-8def-000000000001",
    prescriptionId: `rx_${"e".repeat(24)}`, factsId: "facts-1", snapshotRevision: "snapshot-r1",
    rulesVersion: "coach-prescription-rules-v1", weeklyCheckInId: "bike_2026-07-20", weeklyCheckInRevision: 1 },
  targetRevision: revision, changes: [{ weekId: "week-1", dayIndex: 0, localDate: "2026-07-20",
    action: "modified_workout", before: { action: "follow_plan", workout: { kind: "z2", durationMin: 60, targetTss: 50 } },
    workout: { kind: "recovery", durationMin: 40, targetTss: 25 }, reasonCodes: ["fatigue_high"], evidenceIds: ["ev-1"] }],
  evidence: [evidence], consent: { policyVersion: "ai-coach-policy-v4", revision: "2026-07-20T00:00:00.000Z" },
  createdAt: "2026-07-20T00:00:00.000Z", expiresAt: "2026-07-20T00:15:00.000Z", providerCalls: 0, quotaConsumed: 0 };
const apiVersions = [
  { apiVersion: "v1", capabilityVersion: "p0", requestSchemaVersion: "coach-respond-v1", responseSchemaVersion: "coach-response-payload-v1" },
  { apiVersion: "v2", capabilityVersion: "p1", requestSchemaVersion: "coach-respond-v2", responseSchemaVersion: "coach-response-envelope-v1" },
];
const p2ApiVersion = { apiVersion: "v2", capabilityVersion: "p2", requestSchemaVersion: "coach-respond-graph-v1",
  responseSchemaVersion: "coach-graph-response-envelope-v1" };

describe("Progress Planner backend contract", () => {
  it("keeps read, proposal, and confirm capabilities separate and synchronized", () => {
    const value = { schemaVersion: "coach-capabilities-v1", apiVersions, defaultCapabilityVersion: "p0",
      queryCatalogVersion: "query-v1", factsCatalogVersion: "facts-v1", answerSchemaVersion: "answer-v1",
      answerCatalogVersion: "catalog-v1", progressPlanner: { read: { enabled: true }, proposal: { enabled: false },
        confirm: { enabled: false } }, prescription: { enabled: true, schemaVersion: "coach-prescription-v1",
        rulesVersion: "coach-prescription-rules-v1", checkIn: { enabled: false,
          reasonCode: "prescription_proposal_feature_disabled" } } };
    expect(parseCoachProgressPlannerCapabilities({ data: value }).progressPlanner).toEqual(value.progressPlanner);
    expect(() => parseCoachProgressPlannerCapabilities({ data: { ...value,
      progressPlanner: { ...value.progressPlanner, proposal: { enabled: true } } } })).toThrow();
  });

  it("rejects empty, missing, unknown, duplicate, and version-drifted API discovery tuples", () => {
    const base = { schemaVersion: "coach-capabilities-v1", apiVersions, defaultCapabilityVersion: "p0",
      queryCatalogVersion: "query-v1", factsCatalogVersion: "facts-v1", answerSchemaVersion: "answer-v1",
      answerCatalogVersion: "catalog-v1", progressPlanner: { read: { enabled: true }, proposal: { enabled: true },
        confirm: { enabled: true } }, prescription: { enabled: true, schemaVersion: "coach-prescription-v1",
        rulesVersion: "coach-prescription-rules-v1", checkIn: { enabled: true, endpoint: "/v1/coach/prescription/check-in" } } };
    expect(() => parseCoachProgressPlannerCapabilities({ ...base, apiVersions: [] })).toThrow();
    const { apiVersions: _missing, ...missing } = base;
    expect(() => parseCoachProgressPlannerCapabilities(missing)).toThrow();
    expect(() => parseCoachProgressPlannerCapabilities({ ...base,
      apiVersions: [{ ...apiVersions[0], privateKey: "drift" }] })).toThrow();
    expect(() => parseCoachProgressPlannerCapabilities({ ...base,
      apiVersions: [{ apiVersion: "v3", capabilityVersion: "p2", requestSchemaVersion: "unknown", responseSchemaVersion: "unknown" }] })).toThrow();
    expect(() => parseCoachProgressPlannerCapabilities({ ...base, apiVersions: [apiVersions[0], apiVersions[0]] })).toThrow();
    expect(() => parseCoachProgressPlannerCapabilities({ ...base,
      apiVersions: [{ ...apiVersions[1], capabilityVersion: "p0" }] })).toThrow();
    expect(() => parseCoachProgressPlannerCapabilities({ ...base, apiVersions: [p2ApiVersion] })).toThrow();
  });

  it("accepts P2 only as the exact advertised graph tuple while keeping P0 and P1 independent", () => {
    const value = { schemaVersion: "coach-capabilities-v1", apiVersions: [...apiVersions, p2ApiVersion],
      defaultCapabilityVersion: "p0", queryCatalogVersion: "query-v1", factsCatalogVersion: "facts-v1",
      answerSchemaVersion: "answer-v1", answerCatalogVersion: "catalog-v1",
      progressPlanner: { read: { enabled: true }, proposal: { enabled: true }, confirm: { enabled: true } },
      prescription: { enabled: true, schemaVersion: "coach-prescription-v1", rulesVersion: "coach-prescription-rules-v1",
        checkIn: { enabled: true, endpoint: "/v1/coach/prescription/check-in" } } };
    expect(parseCoachProgressPlannerCapabilities({ data: value }).apiVersions).toEqual(value.apiVersions);
    expect(() => parseCoachProgressPlannerCapabilities({ data: { ...value, apiVersions: [
      ...apiVersions, { ...p2ApiVersion, responseSchemaVersion: "coach-response-envelope-v1" },
    ] } })).toThrow();
  });

  it("strictly accepts pending proposal before/after evidence and rejects write/extra drift", () => {
    expect(parseCoachProposalCreateResponse({ status: "ok", data: { proposal, nonce: "n".repeat(32) },
      providerCalls: 0, quotaConsumed: 0 })).toMatchObject({ status: "ok", data: { proposal: { changes: [{ localDate: "2026-07-20" }] } } });
    expect(() => parseCoachProposalCreateResponse({ status: "ok", data: { proposal: { ...proposal, uid: "private" },
      nonce: "n".repeat(32) }, providerCalls: 0, quotaConsumed: 0 })).toThrow();
    expect(() => parseCoachProposalCreateResponse({ status: "ok", data: { proposal, nonce: "n".repeat(32) },
      providerCalls: 1, quotaConsumed: 0 })).toThrow();
  });

  it.each(["expired", "superseded", "consent_revoked", "applied", "reverted"] as const)(
    "parses the server-owned %s proposal state without inventing a client transition", (status) => {
      expect(parseCoachProposalResponse({ status: "ok", data: { ...proposal, status }, providerCalls: 0,
        quotaConsumed: 0 })).toMatchObject({ data: { status } });
    });

  it("requires exact applied and reverted receipt timestamps with zero execution", () => {
    const applied = { schemaVersion: "coach-change-receipt-v1", proposalId: proposal.proposalId,
      auditId: `audit_${"f".repeat(24)}`, status: "applied", appliedAt: "2026-07-20T00:01:00.000Z",
      beforeRevision: revision, afterRevision: { ...revision, planRevision: `plan_${"1".repeat(24)}` },
      providerCalls: 0, quotaConsumed: 0 };
    expect(parseCoachReceiptResponse({ status: "ok", data: applied, providerCalls: 0, quotaConsumed: 0 }))
      .toMatchObject({ data: { status: "applied" } });
    expect(() => parseCoachReceiptResponse({ status: "ok", data: { ...applied, status: "reverted" },
      providerCalls: 0, quotaConsumed: 0 })).toThrow();
  });

  it("accepts the backend's exact five-state durable recovery DTO", () => {
    const appliedProposal = { ...proposal, status: "applied" };
    const receipt = { schemaVersion: "coach-change-receipt-v1", proposalId: proposal.proposalId,
      auditId: `audit_${"f".repeat(24)}`, status: "applied", appliedAt: "2026-07-20T00:01:00.000Z",
      beforeRevision: revision, afterRevision: { ...revision, planRevision: `plan_${"1".repeat(24)}` },
      providerCalls: 0, quotaConsumed: 0 };
    const source = { prescriptionId: proposal.source.prescriptionId, sourceRequestId: proposal.source.checkInRequestId };
    const rollbackRequestId = "523e4567-e89b-52d3-a456-426614174004";
    const base = { schemaVersion: "coach-change-proposal-recovery-v1", source,
      providerCalls: 0, quotaConsumed: 0 };
    const revertedReceipt = { ...receipt, status: "reverted", revertedAt: "2026-07-20T00:02:00.000Z" };
    const fixtures = [
      { ...base, recoveryStatus: "not_found", reasonCode: null, proposal: null, receipt: null,
        confirmNonce: null, rollbackRequestId: null },
      { ...base, recoveryStatus: "pending", reasonCode: null, proposal, receipt: null,
        confirmNonce: "n".repeat(32), rollbackRequestId: null },
      { ...base, recoveryStatus: "applied", reasonCode: null, proposal: appliedProposal, receipt,
        confirmNonce: null, rollbackRequestId },
      { ...base, recoveryStatus: "reverted", reasonCode: null, proposal: { ...proposal, status: "reverted" },
        receipt: revertedReceipt, confirmNonce: null, rollbackRequestId },
      { ...base, recoveryStatus: "inactive", reasonCode: "proposal_expired", proposal: { ...proposal, status: "expired" },
        receipt: null, confirmNonce: null, rollbackRequestId: null },
      { ...base, recoveryStatus: "inactive", reasonCode: "proposal_revision_changed",
        proposal: { ...proposal, status: "superseded" }, receipt: null, confirmNonce: null, rollbackRequestId: null },
      { ...base, recoveryStatus: "inactive", reasonCode: "consent_not_active",
        proposal: { ...proposal, status: "consent_revoked" }, receipt: null, confirmNonce: null, rollbackRequestId: null },
    ];
    for (const data of fixtures) {
      expect(parseCoachProposalRecoveryResponse({ status: "ok", data, providerCalls: 0, quotaConsumed: 0 }))
        .toMatchObject({ data: { recoveryStatus: data.recoveryStatus, reasonCode: data.reasonCode } });
    }
  });

  it("rejects recovery cross-state combinations and unknown contract drift", () => {
    const receipt = { schemaVersion: "coach-change-receipt-v1", proposalId: proposal.proposalId,
      auditId: `audit_${"f".repeat(24)}`, status: "applied", appliedAt: "2026-07-20T00:01:00.000Z",
      beforeRevision: revision, afterRevision: { ...revision, planRevision: `plan_${"1".repeat(24)}` },
      providerCalls: 0, quotaConsumed: 0 };
    const base = { schemaVersion: "coach-change-proposal-recovery-v1",
      source: { prescriptionId: proposal.source.prescriptionId, sourceRequestId: proposal.source.checkInRequestId },
      recoveryStatus: "pending", reasonCode: null, proposal, receipt: null, confirmNonce: "n".repeat(32),
      rollbackRequestId: null, providerCalls: 0, quotaConsumed: 0 };
    const invalid = [
      { ...base, recoveryStatus: "not_found" },
      { ...base, recoveryStatus: "applied" },
      { ...base, reasonCode: "proposal_expired" },
      { ...base, recoveryStatus: "inactive", reasonCode: "proposal_expired" },
      { ...base, recoveryStatus: "inactive", reasonCode: "consent_not_active",
        proposal: { ...proposal, status: "expired" }, confirmNonce: null },
      { ...base, recoveryStatus: "applied", proposal: { ...proposal, status: "applied" }, receipt,
        confirmNonce: null, rollbackRequestId: "523e4567-e89b-52d3-a456-426614174004",
        privateNonce: "n".repeat(32) },
      { ...base, source: { ...base.source, prescriptionId: `rx_${"0".repeat(24)}` } },
      { ...base, source: { ...base.source, sourceRequestId: "623e4567-e89b-42d3-a456-426614174005" } },
    ];
    for (const data of invalid) {
      expect(() => parseCoachProposalRecoveryResponse({ status: "ok", data, providerCalls: 0, quotaConsumed: 0 })).toThrow();
    }
    expect(() => parseCoachProposalRecoveryResponse({ status: "ok", data: base,
      providerCalls: 0, quotaConsumed: 0, privateOwner: "uid" })).toThrow();
  });

  it("does not expose recovery source identifiers to confirm or rollback requests", () => {
    const requestId = "523e4567-e89b-42d3-a456-426614174004";
    expect(coachProposalConfirmRequestSchema.parse({ requestId, nonce: "n".repeat(32) }))
      .toEqual({ requestId, nonce: "n".repeat(32) });
    expect(coachProposalRollbackRequestSchema.parse({ requestId })).toEqual({ requestId });
    for (const schema of [coachProposalConfirmRequestSchema, coachProposalRollbackRequestSchema]) {
      expect(() => schema.parse({ requestId, prescriptionId: proposal.source.prescriptionId,
        checkInRequestId: proposal.source.checkInRequestId, sourceRequestId: proposal.source.checkInRequestId,
        ...(schema === coachProposalConfirmRequestSchema ? { nonce: "n".repeat(32) } : {}) })).toThrow();
    }
  });
});
