import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CoachClientError, confirmCoachProgressProposal, createCoachProgressProposal, getCoachProgressPlannerCapabilities,
  getCoachProgressProposal, getCoachProgressProposalRecovery, rollbackCoachProgressProposal, submitCoachPrescriptionCheckIn,
} from "../../services/coachClient";
import { parseCoachPrescription, type CoachPrescriptionDTO } from "../../services/coachPrescriptionContract";
import { parseCoachProgressPlannerCapabilities } from "../../services/coachProgressPlannerContract";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import fixtureJson from "./__fixtures__/p2-web-fixture.json";
import { CoachPrescription } from "./CoachPrescription";

const errorLog = vi.hoisted(() => vi.fn());
vi.mock("../../services/coachClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../services/coachClient")>(),
  submitCoachPrescriptionCheckIn: vi.fn(),
  getCoachProgressPlannerCapabilities: vi.fn(),
  createCoachProgressProposal: vi.fn(), getCoachProgressProposal: vi.fn(), confirmCoachProgressProposal: vi.fn(),
  getCoachProgressProposalRecovery: vi.fn(), rollbackCoachProgressProposal: vi.fn(),
}));
vi.mock("../../services/errorLogger", () => ({ logClientError: errorLog }));

const submit = vi.mocked(submitCoachPrescriptionCheckIn);
const capabilities = vi.mocked(getCoachProgressPlannerCapabilities);
const createProposal = vi.mocked(createCoachProgressProposal);
const getProposal = vi.mocked(getCoachProgressProposal);
const recoverProposal = vi.mocked(getCoachProgressProposalRecovery);
const confirmProposal = vi.mocked(confirmCoachProgressProposal);
const rollbackProposal = vi.mocked(rollbackCoachProgressProposal);
const ready = parseCoachPrescription(fixtureJson);
const enabledCapabilities = parseCoachProgressPlannerCapabilities({ schemaVersion: "coach-capabilities-v1", apiVersions: [
  { apiVersion: "v1", capabilityVersion: "p0", requestSchemaVersion: "coach-respond-v1", responseSchemaVersion: "coach-response-payload-v1" },
  { apiVersion: "v2", capabilityVersion: "p1", requestSchemaVersion: "coach-respond-v2", responseSchemaVersion: "coach-response-envelope-v1" },
],
  defaultCapabilityVersion: "p0", queryCatalogVersion: "catalog-query", factsCatalogVersion: "catalog-facts",
  answerSchemaVersion: "answer-schema", answerCatalogVersion: "answer-catalog",
  progressPlanner: { read: { enabled: true }, proposal: { enabled: true }, confirm: { enabled: true } },
  prescription: { enabled: true, schemaVersion: "coach-prescription-v1", rulesVersion: "coach-prescription-rules-v1",
    checkIn: { enabled: true, endpoint: "/v1/coach/prescription/check-in" } } });
const readDisabledCapabilities = parseCoachProgressPlannerCapabilities({ ...enabledCapabilities,
  progressPlanner: { read: { enabled: false }, proposal: { enabled: false }, confirm: { enabled: false } },
  prescription: { enabled: false, reasonCode: "prescription_feature_disabled",
    checkIn: { enabled: false, reasonCode: "prescription_proposal_feature_disabled" } } });
const proposal = { schemaVersion: "coach-change-proposal-v1" as const, proposalId: `proposal_${"d".repeat(24)}`,
  status: "pending" as const, source: { checkInRequestId: "018f47a2-3c4d-7abc-8def-000000000201",
    prescriptionId: ready.prescriptionId, factsId: ready.factsId, snapshotRevision: ready.snapshotRevision,
    rulesVersion: ready.rulesVersion, weeklyCheckInId: "bike_2026-07-20", weeklyCheckInRevision: 1 },
  targetRevision: { goalId: "goal-1", goalHash: `doc_${"a".repeat(32)}`, planRevision: `plan_${"b".repeat(24)}`,
    weeks: [{ weekId: "week-1", hash: `doc_${"c".repeat(32)}` }] },
  changes: [{ weekId: "week-1", dayIndex: 0, localDate: ready.nextDays[0]!.localDate, action: "modified_workout" as const,
    before: { action: "follow_plan" as const, workout: { kind: "z2" as const, durationMin: 60, targetTss: 50 } },
    workout: { kind: "recovery" as const, durationMin: 40, targetTss: 25 }, reasonCodes: ["fatigue_high"],
    evidenceIds: ["ev-review"] }],
  evidence: [{ evidenceId: "ev-review", source: "checkin" as const, sourceId: "bounded", field: "fatigue", value: "tired",
    sourceRevision: "checkin-r1", asOf: "2026-07-20T00:00:00.000Z" }],
  consent: { policyVersion: "ai-coach-policy-v4" as const, revision: "2026-07-20T00:00:00.000Z" },
  createdAt: "2026-07-20T00:00:00.000Z", expiresAt: "2026-07-20T00:15:00.000Z", providerCalls: 0 as const,
  quotaConsumed: 0 as const };
const receipt = { schemaVersion: "coach-change-receipt-v1" as const, proposalId: proposal.proposalId,
  auditId: `audit_${"f".repeat(24)}`, status: "applied" as const, appliedAt: "2026-07-20T00:01:00.000Z",
  beforeRevision: proposal.targetRevision, afterRevision: { ...proposal.targetRevision, planRevision: `plan_${"1".repeat(24)}` },
  providerCalls: 0 as const, quotaConsumed: 0 as const };
const rollbackRequestId = "523e4567-e89b-52d3-a456-426614174004";
const emptyRecovery = { status: "ok" as const, data: { schemaVersion: "coach-change-proposal-recovery-v1" as const,
  source: { prescriptionId: ready.prescriptionId, sourceRequestId: "018f47a2-3c4d-7abc-8def-000000000201" },
  recoveryStatus: "not_found" as const, reasonCode: null,
  proposal: null, receipt: null, confirmNonce: null, rollbackRequestId: null, providerCalls: 0 as const, quotaConsumed: 0 as const },
providerCalls: 0 as const, quotaConsumed: 0 as const };
const pendingRecovery = { ...emptyRecovery, data: { ...emptyRecovery.data, proposal,
  recoveryStatus: "pending" as const, confirmNonce: "n".repeat(32) } };
const appliedRecovery = { ...emptyRecovery, data: { ...emptyRecovery.data, proposal: { ...proposal, status: "applied" as const },
  recoveryStatus: "applied" as const, receipt, rollbackRequestId } };
const revertedRecovery = { ...emptyRecovery, data: { ...emptyRecovery.data, proposal: { ...proposal, status: "reverted" as const },
  recoveryStatus: "reverted" as const,
  receipt: { ...receipt, status: "reverted" as const, revertedAt: "2026-07-20T00:02:00.000Z" }, rollbackRequestId } };

function needsCheckIn(): CoachPrescriptionDTO {
  return parseCoachPrescription({ ...ready, prescriptionId: "rx_111111111111111111111111", status: "needs_checkin",
    nextDays: [], nextWeekLoad: undefined, missingSignals: ["subjective_fatigue", "soreness", "pain_or_illness"],
    requiredSignals: ["subjective_fatigue", "soreness", "pain_or_illness"], checkInToken: "t".repeat(64) });
}

describe("CoachPrescription", () => {
  beforeEach(() => {
    submit.mockReset(); capabilities.mockReset(); capabilities.mockResolvedValue(enabledCapabilities);
    createProposal.mockReset(); getProposal.mockReset(); recoverProposal.mockReset(); confirmProposal.mockReset(); rollbackProposal.mockReset();
    errorLog.mockReset();
    recoverProposal.mockResolvedValue(emptyRecovery);
    resetRuntimeConfigForTests({ coachProgressPlannerEnabled: true });
  });

  it("preserves the existing coach UI while limiting proposal review when the local or backend read capability is off", async () => {
    resetRuntimeConfigForTests({ coachProgressPlannerEnabled: false });
    const localOff = render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    expect(localOff.container.querySelectorAll(".coach-prescription__day")).toHaveLength(7);
    expect(screen.queryByRole("heading", { name: "계획 변경안 검토" })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(capabilities).toHaveBeenCalledOnce());
    localOff.unmount();

    resetRuntimeConfigForTests({ coachProgressPlannerEnabled: true });
    capabilities.mockReset();
    capabilities.mockResolvedValue(readDisabledCapabilities);
    const backendOff = render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    expect(backendOff.container.querySelectorAll(".coach-prescription__day")).toHaveLength(7);
    await vi.waitFor(() => expect(capabilities).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "계획 변경안 검토" })).not.toBeInTheDocument();
    expect(capabilities).toHaveBeenCalledOnce();
  });

  it("keeps safety UI available when the progress planner flag is off", () => {
    resetRuntimeConfigForTests({ coachProgressPlannerEnabled: false });
    render(<CoachPrescription initial={parseCoachPrescription({ ...ready,
      prescriptionId: "rx_222222222222222222222222", status: "safety_blocked", nextDays: [], nextWeekLoad: undefined,
      missingSignals: ["pain_or_illness"] })} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("운동 처방을 표시하지 않습니다");
  });

  it("enables check-in only after the backend capability is explicitly confirmed", async () => {
    let resolveCapabilities!: (value: typeof enabledCapabilities) => void;
    capabilities.mockReturnValue(new Promise((resolve) => { resolveCapabilities = resolve; }));
    render(<CoachPrescription initial={needsCheckIn()} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "보통" }));
    await user.click(screen.getAllByRole("radio", { name: "없음" })[0]!);
    await user.click(screen.getAllByRole("radio", { name: "없음" })[1]!);
    const checkIn = screen.getByRole("button", { name: "확인" });
    expect(checkIn).toBeDisabled();

    resolveCapabilities(enabledCapabilities);
    await vi.waitFor(() => expect(checkIn).toBeEnabled());
  });

  it("keeps check-in disabled and preserves the unavailable state when capability loading fails", async () => {
    const error = new Error("capability unavailable");
    capabilities.mockRejectedValue(error);
    render(<CoachPrescription initial={needsCheckIn()} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "보통" }));
    await user.click(screen.getAllByRole("radio", { name: "없음" })[0]!);
    await user.click(screen.getAllByRole("radio", { name: "없음" })[1]!);
    expect(await screen.findByRole("alert")).toHaveTextContent("계획 기능 상태를 확인할 수 없습니다");
    expect(screen.getByRole("button", { name: "확인" })).toBeDisabled();
    expect(errorLog).toHaveBeenCalledWith("CoachPrescription.capabilities", error, expect.objectContaining({
      stage: "capabilities", operation: "load", prescriptionId: "rx_111111111111111111111111",
    }));
  });

  it("keeps check-in disabled when the server capability is explicitly false", async () => {
    capabilities.mockResolvedValue(readDisabledCapabilities);
    render(<CoachPrescription initial={needsCheckIn()} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "보통" }));
    await user.click(screen.getAllByRole("radio", { name: "없음" })[0]!);
    await user.click(screen.getAllByRole("radio", { name: "없음" })[1]!);
    await vi.waitFor(() => expect(capabilities).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "확인" })).toBeDisabled();
  });

  it.each([
    ["true", enabledCapabilities, true], ["false", readDisabledCapabilities, false],
  ] as const)("uses server check-in capability %s while the local progress planner flag is off", async (_, serverCapabilities, expected) => {
    resetRuntimeConfigForTests({ coachProgressPlannerEnabled: false });
    capabilities.mockResolvedValue(serverCapabilities);
    render(<CoachPrescription initial={needsCheckIn()} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "보통" }));
    await user.click(screen.getAllByRole("radio", { name: "없음" })[0]!);
    await user.click(screen.getAllByRole("radio", { name: "없음" })[1]!);
    await vi.waitFor(() => expect(capabilities).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "확인" })).toHaveProperty("disabled", !expected);
  });

  it("renders the canonical backend fixture as exactly seven server-provided days and weekly TSS", async () => {
    const { container } = render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    await screen.findByText("200–250 TSS");
    expect(container.querySelectorAll(".coach-prescription__day")).toHaveLength(7);
    expect(screen.getAllByText("휴식").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("200–250 TSS")).toBeInTheDocument();
    expect(screen.getByText("59분")).toBeInTheDocument();
    expect(screen.getByText("목표 TSS 30")).toBeInTheDocument();
    expect(screen.getByText("coach-prescription-rules-v1")).toBeInTheDocument();
    expect(container).toHaveTextContent("rx.resume.form.v1");
    expect(container.querySelector('[data-evidence-id="rx_ev_b925cd58b64ca98d2cae"]')).toBeInTheDocument();
    expect(screen.getByText("이 내용은 제안이며 확인 전에는 운동 계획에 저장되지 않습니다.")).toBeInTheDocument();
  });

  it("preserves combined check-in answers and gives safety priority without workout or TSS UI", async () => {
    submit.mockResolvedValue({ status: "ok", prescription: parseCoachPrescription({ ...ready,
      prescriptionId: "rx_222222222222222222222222", status: "safety_blocked", nextDays: [], nextWeekLoad: undefined,
      missingSignals: ["pain_or_illness"] }), providerCalls: 0, quotaConsumed: 0 });
    const { container } = render(<CoachPrescription initial={needsCheckIn()} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "피곤함" }));
    await user.click(screen.getAllByRole("radio", { name: "있음" })[0]!);
    await user.click(screen.getAllByRole("radio", { name: "있음" })[1]!);
    await user.click(screen.getByRole("button", { name: "확인" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ parentRequestId: "018f47a2-3c4d-7abc-8def-000000000201",
      requestId: expect.any(String), answers: { subjectiveFatigue: "tired", soreness: "present", painOrIllness: true } }));
    expect(screen.getByRole("alert")).toHaveTextContent("운동 처방을 표시하지 않습니다");
    expect(container.querySelector(".coach-prescription__workout")).toBeNull();
    expect(screen.queryByText(/TSS/)).not.toBeInTheDocument();
  });

  it("reuses the same requestId for a transport retry and requires a new analysis for revision drift", async () => {
    submit.mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockResolvedValueOnce({ status: "error", error: { code: "checkin_revision_changed", retryable: false }, providerCalls: 0, quotaConsumed: 0 });
    const reanalyze = vi.fn();
    render(<CoachPrescription initial={needsCheckIn()} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={reanalyze} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "보통" }));
    await user.click(screen.getAllByRole("radio", { name: "없음" })[0]!);
    await user.click(screen.getAllByRole("radio", { name: "없음" })[1]!);
    await user.click(screen.getByRole("button", { name: "확인" }));
    const firstId = submit.mock.calls[0]![0].requestId;
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(submit.mock.calls[1]![0].requestId).toBe(firstId);
    expect(screen.getByRole("alert")).toHaveTextContent("데이터나 계획이 변경되었거나 확인 시간이 만료되었습니다");
    await user.click(screen.getByRole("button", { name: "새 분석 시작" }));
    expect(reanalyze).toHaveBeenCalledOnce();
  });

  it.each(["invalid_checkin_token", "invalid_checkin_signature"])("requires reanalysis for %s", async (code) => {
    submit.mockResolvedValue({ status: "error", error: { code, retryable: false }, providerCalls: 0, quotaConsumed: 0 });
    render(<CoachPrescription initial={needsCheckIn()} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "보통" }));
    await user.click(screen.getAllByRole("radio", { name: "없음" })[0]!);
    await user.click(screen.getAllByRole("radio", { name: "없음" })[1]!);
    await user.click(screen.getByRole("button", { name: "확인" }));
    expect(screen.getByRole("button", { name: "새 분석 시작" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it("previews server-derived before/after and requires a separate final confirmation", async () => {
    recoverProposal.mockResolvedValueOnce(emptyRecovery).mockResolvedValueOnce(pendingRecovery).mockResolvedValue(appliedRecovery);
    createProposal.mockResolvedValue({ status: "ok", data: { proposal, nonce: "n".repeat(32) }, providerCalls: 0, quotaConsumed: 0 });
    confirmProposal.mockResolvedValue({ status: "ok", data: receipt, providerCalls: 0, quotaConsumed: 0 });
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "변경안 미리보기" }));
    expect(createProposal).toHaveBeenCalledWith(expect.objectContaining({ checkInRequestId: "018f47a2-3c4d-7abc-8def-000000000201" }));
    expect(await screen.findByText("변경 전")).toBeInTheDocument();
    expect(screen.getByText("변경 후")).toBeInTheDocument();
    expect(screen.getByText(/fatigue_high/u)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "적용 검토" }));
    expect(confirmProposal).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("마지막 확인");
    await user.click(screen.getByRole("button", { name: "확인하고 계획에 적용" }));
    expect(confirmProposal).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("계획에 한 번만 적용했습니다")).toBeInTheDocument();
  });

  it("keeps confirm disabled while proposal preview and GET remain available", async () => {
    capabilities.mockResolvedValue({ ...enabledCapabilities,
      progressPlanner: { ...enabledCapabilities.progressPlanner, confirm: { enabled: false } } });
    createProposal.mockResolvedValue({ status: "ok", data: { proposal, nonce: "n".repeat(32) }, providerCalls: 0, quotaConsumed: 0 });
    recoverProposal.mockResolvedValueOnce(emptyRecovery).mockResolvedValue(pendingRecovery);
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "변경안 미리보기" }));
    expect(await screen.findByText("현재 적용 기능이 꺼져 있어 계획은 변경되지 않습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "적용 검토" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "현재 상태 새로고침" }));
    expect(recoverProposal).toHaveBeenLastCalledWith(ready.prescriptionId, "018f47a2-3c4d-7abc-8def-000000000201");
    expect(getProposal).not.toHaveBeenCalled(); expect(confirmProposal).not.toHaveBeenCalled();
  });

  it("hydrates a pending recovery with the canonical confirm nonce and keeps GET available", async () => {
    recoverProposal.mockResolvedValue(pendingRecovery);
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "적용 검토" })).toBeEnabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "현재 상태 새로고침" }));
    expect(recoverProposal).toHaveBeenCalledTimes(2); expect(getProposal).not.toHaveBeenCalled();
    expect(confirmProposal).not.toHaveBeenCalled();
  });

  it("retries an initial transient recovery failure instead of remaining permanently blocked", async () => {
    const error = new CoachClientError("transport", "NETWORK_ERROR");
    recoverProposal.mockRejectedValueOnce(error);
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const retry = await screen.findByRole("button", { name: "현재 상태 새로고침" });
    expect(screen.getByRole("button", { name: "변경안 미리보기" })).toBeDisabled();
    await userEvent.setup().click(retry);
    expect(await screen.findByRole("button", { name: "변경안 미리보기" })).toBeEnabled();
    expect(recoverProposal).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledWith("CoachPrescription.recovery", error, expect.objectContaining({
      stage: "recovery", operation: "initial", prescriptionId: ready.prescriptionId,
    }));
  });

  it.each(["expired", "superseded", "consent_revoked"] as const)(
    "maps a canonical remounted %s proposal directly to stale reanalysis", async (status) => {
      const reasonCode = { expired: "proposal_expired", superseded: "proposal_revision_changed",
        consent_revoked: "consent_not_active" }[status] as "proposal_expired" | "proposal_revision_changed" | "consent_not_active";
      recoverProposal.mockResolvedValue({ ...emptyRecovery, data: { ...emptyRecovery.data,
        recoveryStatus: "inactive", reasonCode, proposal: { ...proposal, status }, confirmNonce: null } });
      const onReanalyze = vi.fn();
      render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
        locale="ko-KR" onReanalyze={onReanalyze} />);
      expect(await screen.findByText(/계획·주간 체크인·동의가 변경/u)).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole("button", { name: "새 분석으로 다시 확인" }));
      expect(onReanalyze).toHaveBeenCalledOnce();
      expect(screen.queryByText(/변경 상태를 확인하지 못/u)).not.toBeInTheDocument();
      expect(confirmProposal).not.toHaveBeenCalled(); expect(rollbackProposal).not.toHaveBeenCalled();
    });

  it("maps automatic adjustment conflicts to a stale safe state with no confirm replay", async () => {
    const error = new CoachClientError("http", "proposal_weekly_checkin_changed");
    createProposal.mockRejectedValue(error);
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "변경안 미리보기" }));
    expect(await screen.findByText(/계획·주간 체크인·동의가 변경/u)).toBeInTheDocument();
    expect(confirmProposal).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("CoachPrescription.create", error, expect.objectContaining({
      stage: "create", operation: "create", prescriptionId: ready.prescriptionId, requestId: expect.any(String),
    }));
  });

  it.each([
    ["proposal_feature_disabled", "현재 이 변경 기능이 꺼져 있습니다.", false],
    ["proposal_weekly_checkin_changed", "계획·주간 체크인·동의가 변경되어 이 변경안을 적용할 수 없습니다.", true],
  ] as const)("maps a non-retryable %s response without presenting it as transient", async (code, message, reanalyze) => {
    createProposal.mockResolvedValue({ status: "error", error: { code, retryable: false }, providerCalls: 0, quotaConsumed: 0 });
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "변경안 미리보기" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    if (reanalyze) expect(screen.getByRole("button", { name: "새 분석으로 다시 확인" })).toBeInTheDocument();
    else expect(screen.queryByRole("button", { name: "새 분석으로 다시 확인" })).not.toBeInTheDocument();
  });

  it("keeps a normal retryable create response retryable with the same UUID", async () => {
    recoverProposal.mockResolvedValueOnce(emptyRecovery).mockResolvedValueOnce(pendingRecovery);
    createProposal.mockResolvedValueOnce({ status: "error", error: { code: "temporarily_unavailable", retryable: true },
      providerCalls: 0, quotaConsumed: 0 })
      .mockResolvedValueOnce({ status: "ok", data: { proposal, nonce: "n".repeat(32) }, providerCalls: 0, quotaConsumed: 0 });
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "변경안 미리보기" }));
    expect(await screen.findByText("변경 상태를 확인하지 못했습니다. 기존 계획은 유지됩니다.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "변경안 미리보기" }));
    expect(createProposal).toHaveBeenCalledTimes(2);
    expect(createProposal.mock.calls[1]![0].requestId).toBe(createProposal.mock.calls[0]![0].requestId);
    expect(await screen.findByText("변경 전")).toBeInTheDocument();
  });

  it("keeps cross-owner proposal failures generic and never exposes or mutates another plan", async () => {
    createProposal.mockRejectedValue(new CoachClientError("http", "proposal_not_found"));
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "변경안 미리보기" }));
    expect(await screen.findByText(/기존 계획은 유지/u)).toBeInTheDocument();
    expect(screen.queryByText("proposal_not_found")).not.toBeInTheDocument();
    expect(confirmProposal).not.toHaveBeenCalled();
  });

  it("replays a transport-uncertain confirmation with the same UUID and shows one receipt", async () => {
    recoverProposal.mockResolvedValueOnce(emptyRecovery).mockResolvedValueOnce(pendingRecovery).mockResolvedValue(appliedRecovery);
    createProposal.mockResolvedValue({ status: "ok", data: { proposal, nonce: "n".repeat(32) }, providerCalls: 0, quotaConsumed: 0 });
    const error = new CoachClientError("transport", "NETWORK_ERROR");
    confirmProposal.mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ status: "ok", data: receipt, providerCalls: 0, quotaConsumed: 0 });
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "변경안 미리보기" }));
    await user.click(screen.getByRole("button", { name: "적용 검토" }));
    await user.click(screen.getByRole("button", { name: "확인하고 계획에 적용" }));
    await user.click(await screen.findByRole("button", { name: "같은 적용 요청 다시 확인" }));
    expect(confirmProposal).toHaveBeenCalledTimes(2);
    expect(confirmProposal.mock.calls[1]![1].requestId).toBe(confirmProposal.mock.calls[0]![1].requestId);
    expect(await screen.findAllByText("계획에 한 번만 적용했습니다")).toHaveLength(1);
    expect(errorLog).toHaveBeenCalledWith("CoachPrescription.confirm", error, expect.objectContaining({
      stage: "confirm", operation: "confirm", proposalId: proposal.proposalId, requestId: expect.any(String),
    }));
  });

  it("keeps a normal retryable confirmation response retryable with the same UUID", async () => {
    recoverProposal.mockResolvedValueOnce(emptyRecovery).mockResolvedValueOnce(pendingRecovery).mockResolvedValue(appliedRecovery);
    createProposal.mockResolvedValue({ status: "ok", data: { proposal, nonce: "n".repeat(32) }, providerCalls: 0, quotaConsumed: 0 });
    confirmProposal.mockResolvedValueOnce({ status: "error", error: { code: "temporarily_unavailable", retryable: true },
      providerCalls: 0, quotaConsumed: 0 })
      .mockResolvedValueOnce({ status: "ok", data: receipt, providerCalls: 0, quotaConsumed: 0 });
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "변경안 미리보기" }));
    await user.click(screen.getByRole("button", { name: "적용 검토" }));
    await user.click(screen.getByRole("button", { name: "확인하고 계획에 적용" }));
    await user.click(await screen.findByRole("button", { name: "같은 적용 요청 다시 확인" }));
    expect(confirmProposal).toHaveBeenCalledTimes(2);
    expect(confirmProposal.mock.calls[1]![1].requestId).toBe(confirmProposal.mock.calls[0]![1].requestId);
    expect(await screen.findByText("계획에 한 번만 적용했습니다")).toBeInTheDocument();
  });

  it("rolls back an applied receipt independently of the confirm capability", async () => {
    createProposal.mockResolvedValue({ status: "ok", data: { proposal, nonce: "n".repeat(32) }, providerCalls: 0, quotaConsumed: 0 });
    confirmProposal.mockResolvedValue({ status: "ok", data: receipt, providerCalls: 0, quotaConsumed: 0 });
    recoverProposal.mockResolvedValueOnce(emptyRecovery).mockResolvedValueOnce(pendingRecovery)
      .mockResolvedValueOnce(appliedRecovery).mockResolvedValue(revertedRecovery);
    rollbackProposal.mockResolvedValue({ status: "ok", data: { ...receipt, status: "reverted", revertedAt: "2026-07-20T00:02:00.000Z" },
      providerCalls: 0, quotaConsumed: 0 });
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "변경안 미리보기" }));
    await user.click(await screen.findByRole("button", { name: "적용 검토" }));
    await user.click(screen.getByRole("button", { name: "확인하고 계획에 적용" }));
    await user.click(await screen.findByRole("button", { name: "적용 내용 되돌리기" }));
    expect(rollbackProposal).toHaveBeenCalledWith(proposal.proposalId, { requestId: rollbackRequestId });
    expect(await screen.findByText("감사 기록의 변경 전 상태로 복구했습니다")).toBeInTheDocument();
  });

  it.each([
    ["proposal_confirm_feature_disabled", "현재 이 변경 기능이 꺼져 있습니다."],
    ["rollback_conflict", "이후 계획 변경과 충돌하여 안전하게 처리하지 않았습니다."],
  ] as const)("keeps a non-retryable rollback %s response terminal", async (code, message) => {
    recoverProposal.mockResolvedValue(appliedRecovery);
    rollbackProposal.mockResolvedValue({ status: "error", error: { code, retryable: false }, providerCalls: 0, quotaConsumed: 0 });
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "적용 내용 되돌리기" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "같은 되돌리기 요청 다시 확인" })).not.toBeInTheDocument();
    expect(rollbackProposal).toHaveBeenCalledTimes(1);
  });

  it("retries a normal retryable rollback response with the same idempotency UUID", async () => {
    recoverProposal.mockResolvedValueOnce(appliedRecovery).mockResolvedValue(revertedRecovery);
    rollbackProposal.mockResolvedValueOnce({ status: "error", error: { code: "temporarily_unavailable", retryable: true },
      providerCalls: 0, quotaConsumed: 0 })
      .mockResolvedValueOnce({ status: "ok", data: { ...receipt, status: "reverted", revertedAt: "2026-07-20T00:02:00.000Z" },
        providerCalls: 0, quotaConsumed: 0 });
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "적용 내용 되돌리기" }));
    await user.click(await screen.findByRole("button", { name: "같은 되돌리기 요청 다시 확인" }));
    expect(rollbackProposal).toHaveBeenCalledTimes(2);
    expect(rollbackProposal.mock.calls[1]![1].requestId).toBe(rollbackProposal.mock.calls[0]![1].requestId);
    expect(await screen.findByText("감사 기록의 변경 전 상태로 복구했습니다")).toBeInTheDocument();
  });

  it("rehydrates an applied proposal after remount and retries rollback with one stable UUID while confirm is off", async () => {
    const appliedProposal = { ...proposal, status: "applied" as const };
    recoverProposal.mockResolvedValueOnce({ ...appliedRecovery, data: { ...appliedRecovery.data, proposal: appliedProposal } })
      .mockResolvedValueOnce({ ...appliedRecovery, data: { ...appliedRecovery.data, proposal: appliedProposal } })
      .mockResolvedValue(revertedRecovery);
    const error = new CoachClientError("transport", "NETWORK_ERROR");
    rollbackProposal.mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ status: "ok", data: { ...receipt, status: "reverted", revertedAt: "2026-07-20T00:02:00.000Z" },
        providerCalls: 0, quotaConsumed: 0 });
    const firstMount = render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "적용 내용 되돌리기" }));
    expect(await screen.findByRole("button", { name: "같은 되돌리기 요청 다시 확인" })).toBeInTheDocument();
    firstMount.unmount();

    capabilities.mockResolvedValue({ ...enabledCapabilities,
      progressPlanner: { ...enabledCapabilities.progressPlanner, confirm: { enabled: false } } });
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "적용 내용 되돌리기" }));
    expect(confirmProposal).not.toHaveBeenCalled();
    expect(rollbackProposal).toHaveBeenCalledTimes(2);
    expect(rollbackProposal.mock.calls[1]![1].requestId).toBe(rollbackProposal.mock.calls[0]![1].requestId);
    expect(await screen.findByText("감사 기록의 변경 전 상태로 복구했습니다")).toBeInTheDocument();
    expect(recoverProposal).toHaveBeenLastCalledWith(ready.prescriptionId, "018f47a2-3c4d-7abc-8def-000000000201");
    expect(errorLog).toHaveBeenCalledWith("CoachPrescription.rollback", error, expect.objectContaining({
      stage: "rollback", operation: "rollback", proposalId: proposal.proposalId, requestId: rollbackRequestId,
    }));
  });

  it("fills an example question without submitting and clears the link in the parent composer contract", async () => {
    const onQuestionSelect = vi.fn();
    render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} onQuestionSelect={onQuestionSelect} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "이번 주 계획에서 가장 중요한 운동은 무엇인가요?" }));
    expect(onQuestionSelect).toHaveBeenCalledWith("이번 주 계획에서 가장 중요한 운동은 무엇인가요?", ready.prescriptionId,
      "018f47a2-3c4d-7abc-8def-000000000201");
    expect(createProposal).not.toHaveBeenCalled(); expect(confirmProposal).not.toHaveBeenCalled();
  });
});
