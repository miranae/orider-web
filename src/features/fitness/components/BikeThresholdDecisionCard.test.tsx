import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import BikeThresholdDecisionCard from "./BikeThresholdDecisionCard";

const labels: Record<string, string> = {
  "thresholdDecision.activeLabel": "현재 적용 FTP",
  "thresholdDecision.candidateLabel": "PDC 자동 추정 후보",
  "thresholdDecision.apply": "이 후보 적용",
  "thresholdDecision.evidenceToggle": "추정 근거와 기간 보기",
  "thresholdDecision.evidence.cp": "임계 파워 (CP)",
  "thresholdDecision.evidence.twenty": "20분 최고 평균 파워",
  "thresholdDecision.evidence.monthly": "월별 eFTP",
};
const t = (key: string) => labels[key] ?? key;

describe("BikeThresholdDecisionCard", () => {
  it("distinguishes the active value, candidate, CP, raw 20m and monthly eFTP", () => {
    renderWithProviders(
      <BikeThresholdDecisionCard
        decision={{ activeFtpW: 203, automaticCandidateW: 153, cpW: 158, recentTwentyMinuteW: 173, latestMonthlyEstimate: { period: "2026-06", ftpW: 154 }, tteMin: 42, activityCount: 12 }}
        hasZoneData
        ftpDecision={null}
        onAcceptDecision={vi.fn()}
        progressionPoints={[
          { period: "2026-05", ftpW: 150, source: "20m" },
          { period: "2026-06", ftpW: 154, source: "20m" },
        ]}
        t={t}
      />,
    );

    expect(screen.getByText("203")).toBeInTheDocument();
    expect(screen.getByText("153")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /월별 추정 FTP 추이 차트/, hidden: true })).not.toBeVisible();
    expect(screen.queryByRole("button", { name: /후보 적용|candidate/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "추정 근거와 기간 보기" }));
    expect(screen.getByText("158 W")).toBeVisible();
    expect(screen.getByText("173 W")).toBeVisible();
    expect(screen.getByText("154 W")).toBeVisible();
    expect(screen.getByRole("img", { name: /월별 추정 FTP 추이 차트/ })).toBeVisible();
    expect(screen.queryByText("최근 자동 추정값")).not.toBeInTheDocument();
  });

  it("can render the consolidated evidence open by default", () => {
    renderWithProviders(
      <BikeThresholdDecisionCard
        decision={{ activeFtpW: 250, automaticCandidateW: 265, cpW: 270, recentTwentyMinuteW: 279, latestMonthlyEstimate: { period: "2026-06", ftpW: 265 }, tteMin: 45, activityCount: 12 }}
        hasZoneData
        ftpDecision={{
          schemaVersion: 2,
          decisionId: "bike-ftp-1234567890abcdef1234567890abcdef",
          status: "actionable",
          candidate: { ftp: 265, currentFtp: 250, method: "pdc_cp_097", deltaW: 15, deltaPct: 6 },
          evidence: { activityId: "activity-1", activityRevision: "activity-r1", powerSource: "measured", pdcRevision: "pdc-r1" },
          expectedRevisions: { ftp: "ftp-1", pdc: "pdc-r1", impactPreview: "impact-1" },
          confidence: { level: "high", score: 0.9, reasons: ["measured_power"] },
          impactPreview: { revision: "impact-1", effectiveFrom: "next_ride", workoutScalePct: 106 },
          createdAt: Date.now() - 1_000,
          expiresAt: Date.now() + 86_400_000,
        }}
        onAcceptDecision={vi.fn()}
        progressionPoints={[{ period: "2026-05", ftpW: 255, source: "20m" }, { period: "2026-06", ftpW: 265, source: "20m" }]}
        defaultEvidenceOpen
        t={t}
      />,
    );

    expect(screen.getByRole("button", { name: "추정 근거와 기간 보기" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("270 W")).toBeVisible();
    expect(screen.getByRole("img", { name: /월별 추정 FTP 추이 차트:.*255W.*265W/ })).toBeVisible();
  });
});
