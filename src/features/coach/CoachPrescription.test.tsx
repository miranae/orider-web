import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoachClientError, submitCoachPrescriptionCheckIn } from "../../services/coachClient";
import { parseCoachPrescription, type CoachPrescriptionDTO } from "../../services/coachPrescriptionContract";
import fixtureJson from "./__fixtures__/p2-web-fixture.json";
import { CoachPrescription } from "./CoachPrescription";

vi.mock("../../services/coachClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../services/coachClient")>(),
  submitCoachPrescriptionCheckIn: vi.fn(),
}));

const submit = vi.mocked(submitCoachPrescriptionCheckIn);
const ready = parseCoachPrescription(fixtureJson);

function needsCheckIn(): CoachPrescriptionDTO {
  return parseCoachPrescription({ ...ready, prescriptionId: "rx_111111111111111111111111", status: "needs_checkin",
    nextDays: [], nextWeekLoad: undefined, missingSignals: ["subjective_fatigue", "soreness", "pain_or_illness"],
    requiredSignals: ["subjective_fatigue", "soreness", "pain_or_illness"], checkInToken: "t".repeat(64) });
}

describe("CoachPrescription", () => {
  beforeEach(() => submit.mockReset());

  it("renders the canonical backend fixture as exactly seven server-provided days and weekly TSS", () => {
    const { container } = render(<CoachPrescription initial={ready} parentRequestId="018f47a2-3c4d-7abc-8def-000000000201"
      locale="ko-KR" onReanalyze={vi.fn()} />);
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
    await user.click(screen.getByRole("radio", { name: "피곤함" }));
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
    await user.click(screen.getByRole("radio", { name: "보통" }));
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
    await user.click(screen.getByRole("radio", { name: "보통" }));
    await user.click(screen.getAllByRole("radio", { name: "없음" })[0]!);
    await user.click(screen.getAllByRole("radio", { name: "없음" })[1]!);
    await user.click(screen.getByRole("button", { name: "확인" }));
    expect(screen.getByRole("button", { name: "새 분석 시작" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });
});
