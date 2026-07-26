import ridePlan from "./ride-plan.fixture.json";

const capabilities = {
  schemaVersion: "coach-capabilities-v1", apiVersions: [
    { apiVersion: "v1", capabilityVersion: "p0", requestSchemaVersion: "coach-respond-v1", responseSchemaVersion: "coach-response-payload-v1" },
    { apiVersion: "v2", capabilityVersion: "p1", requestSchemaVersion: "coach-respond-v2", responseSchemaVersion: "coach-response-envelope-v1" },
  ], defaultCapabilityVersion: "p0", queryCatalogVersion: "catalog-query", factsCatalogVersion: "catalog-facts",
  answerSchemaVersion: "answer-schema", answerCatalogVersion: "answer-catalog",
  progressPlanner: { read: { enabled: true }, proposal: { enabled: true }, confirm: { enabled: true } },
  prescription: { enabled: true, schemaVersion: "coach-prescription-v1", rulesVersion: "coach-prescription-rules-v1",
    checkIn: { enabled: true, endpoint: "/v1/coach/prescription/check-in" } },
};
export async function getCoachProgressPlannerCapabilities() { return capabilities; }
export async function getCoachProgressProposalRecovery(_prescriptionId: string, sourceRequestId: string) {
  return { status: "ok", data: { schemaVersion: "coach-change-proposal-recovery-v1",
    source: { prescriptionId: "rx_aaaaaaaaaaaaaaaaaaaaaaaa", sourceRequestId }, recoveryStatus: "not_found",
    reasonCode: null, proposal: null, receipt: null, confirmNonce: null, rollbackRequestId: null,
    providerCalls: 0, quotaConsumed: 0 }, providerCalls: 0, quotaConsumed: 0 };
}
export async function loadCoachRidePlan() { return ridePlan; }
export async function getCoachRidePlanAiContext(_courseId: string, _token: string, questionCode: string) {
  return { schemaVersion: ridePlan.schemaVersion, inputRevision: ridePlan.inputRevision, questionCode,
    course: ridePlan.course, estimate: ridePlan.estimate, segments: ridePlan.segments, assumptions: ridePlan.assumptions };
}
export async function submitCoachPrescriptionCheckIn() { throw new Error("evidence-only:not-invoked"); }
export async function createCoachProgressProposal() { throw new Error("evidence-only:not-invoked"); }
export async function confirmCoachProgressProposal() { throw new Error("evidence-only:not-invoked"); }
export async function rollbackCoachProgressProposal() { throw new Error("evidence-only:not-invoked"); }
export function isCoachClientError() { return false; }
