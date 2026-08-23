import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BikeThresholdDecisionV2 } from "@shared/types/threshold";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import BikeFtpDecisionActionPanel from "./BikeFtpDecisionActionPanel";

const pendingDecision: BikeThresholdDecisionV2 = {
  schemaVersion: 2,
  decisionId: "bike-ftp-1234567890abcdef1234567890abcdef",
  status: "actionable",
  candidate: { ftp: 265, currentFtp: 250, method: "pdc_cp_097", deltaW: 15, deltaPct: 6 },
  evidence: { activityId: "activity-1", activityRevision: "activity-r1", powerSource: "measured", pdcRevision: "pdc-r1" },
  expectedRevisions: { ftp: "ftp-r1", pdc: "pdc-r1", impactPreview: "impact-r1" },
  confidence: { level: "high", score: 0.9, reasons: ["measured_power"] },
  impactPreview: { revision: "impact-r1", effectiveFrom: "next_ride", workoutScalePct: 106 },
  createdAt: Date.now() - 1_000,
  expiresAt: Date.now() + 86_400_000,
};

describe("BikeFtpDecisionActionPanel", () => {
  it("accepts only the server decision, not the PDC display value", () => {
    const onAccept = vi.fn();
    renderWithProviders(<BikeFtpDecisionActionPanel decision={pendingDecision} onAccept={onAccept} />);
    expect(screen.getByText("265")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 FTP로 변경" }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("renders aggregate and per-device receipt states after acceptance", () => {
    renderWithProviders(
      <BikeFtpDecisionActionPanel
        decision={{ ...pendingDecision, status: "accepted", ftpMutationId: "mutation-1" }}
        receipt={{
          schemaVersion: 1,
          mutationId: "mutation-1",
          ftpRevision: "ftp-r2",
          ftpGeneration: 2,
          targetedDeviceCount: 1,
          pendingCount: 0,
          receivedCount: 0,
          deferredCount: 0,
          appliedCount: 1,
          failedCount: 0,
          supersededCount: 0,
          status: "complete",
          createdAt: 1,
          updatedAt: 2,
        }}
        deviceReceipts={[{ deviceId: "device-1", ftpRevision: "ftp-r2", ftpGeneration: 2, state: "applied_for_next_ride", acknowledgedAt: 2, failureCode: null }]}
        onAccept={vi.fn()}
      />,
    );
    expect(screen.getByText("FTP가 적용되었고 1대 기기 동기화가 완료되었습니다.")).toBeInTheDocument();
    expect(screen.getByText("다음 라이드에 적용됨")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 FTP로 변경" })).not.toBeInTheDocument();
  });

  it.each([
    [
      "increase_over_15_percent" as const,
      { ftp: 290, currentFtp: 250, method: "activity_20m_095" as const, deltaW: 40, deltaPct: 16 },
      "후보 FTP가 현재 값보다 15%를 초과해 자동 변경을 중지했습니다. 전용 FTP 테스트나 추가 활동으로 다시 확인하세요.",
    ],
    [
      "activity_pdc_disagreement" as const,
      { ftp: 275, currentFtp: 250, method: "pdc_cp_097" as const, deltaW: 25, deltaPct: 10 },
      "이번 활동의 FTP 추정치와 누적 PDC가 3% 넘게 달라 자동 변경을 중지했습니다. 추가 측정 활동으로 두 근거가 수렴하는지 확인하세요.",
    ],
  ])("explains blocked reason %s separately", (blockReason, candidate, message) => {
    renderWithProviders(
      <BikeFtpDecisionActionPanel
        decision={{ ...pendingDecision, status: "blocked", blockReason, candidate }}
        onAccept={vi.fn()}
      />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 FTP로 변경" })).not.toBeInTheDocument();
  });
});
