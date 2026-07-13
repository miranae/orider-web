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
    const onApply = vi.fn();
    renderWithProviders(
      <BikeThresholdDecisionCard
        decision={{ activeFtpW: 203, automaticCandidateW: 153, cpW: 158, recentTwentyMinuteW: 173, latestMonthlyEstimate: { period: "2026-06", ftpW: 154 }, tteMin: 42, activityCount: 12 }}
        hasZoneData
        applying={false}
        onApplyCandidate={onApply}
        progressionPoints={[
          { period: "2026-05", ftpW: 150, source: "20m" },
          { period: "2026-06", ftpW: 154, source: "20m" },
        ]}
        t={t}
      />,
    );

    expect(screen.getByText("203")).toBeInTheDocument();
    expect(screen.getByText("153")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "월별 추정 FTP 추이 차트", hidden: true })).not.toBeVisible();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "thresholdDecision.applyAria" }));
    expect(onApply).toHaveBeenCalledWith(153);

    fireEvent.click(screen.getByRole("button", { name: "추정 근거와 기간 보기" }));
    expect(screen.getByText("158 W")).toBeVisible();
    expect(screen.getByText("173 W")).toBeVisible();
    expect(screen.getByText("154 W")).toBeVisible();
    expect(screen.getByRole("img", { name: "월별 추정 FTP 추이 차트" })).toBeVisible();
    expect(screen.queryByText("최근 자동 추정값")).not.toBeInTheDocument();
  });
});
