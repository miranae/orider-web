import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import BikePerformanceSummaryCard from "./BikePerformanceSummaryCard";

const completeDecision = {
  activeFtpW: 250,
  automaticCandidateW: 265,
  cpW: 270,
  recentTwentyMinuteW: 279,
  latestMonthlyEstimate: { period: "2026-07", ftpW: 265 },
  tteMin: 45,
  activityCount: 14,
};

describe("BikePerformanceSummaryCard", () => {
  it("renders the Garmin-like hierarchy and keeps candidate application explicit", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { container } = renderWithProviders(
      <BikePerformanceSummaryCard
        decision={completeDecision}
        pdc={{ riderType: { type: "Climber", confidence: 0.8 }, abilityPercentile: 82, vo2maxEst: 58.4, vo2maxPercentile: 75, activityCount: 14 }}
        weightKg={70}
        progression={[{ period: "2026-06", ftpW: 255, source: "20m" }, { period: "2026-07", ftpW: 265, source: "20m" }]}
        applying={false}
        onApplyCandidate={onApply}
      />,
    );

    expect(screen.getByRole("heading", { name: "사이클링 퍼포먼스" })).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("3.57 W/kg")).toBeInTheDocument();
    expect(screen.getByText(/프로필 정본/)).toBeInTheDocument();
    expect(screen.getByText("클라이머")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "종합 사이클링 역량 백분위" })).toHaveAttribute("aria-valuenow", "82");
    expect(screen.getByRole("meter", { name: "종합 사이클링 역량 백분위" })).toHaveAttribute("aria-valuetext", "백분위 82, 상위 18퍼센트");
    expect(screen.getByText("Coggan 남성 파워 프로파일 v1 기준 · 성별·연령 미보정")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="eftp"]')!).getByText("265")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="cp"]')!).getByText("270")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="tte"]')!).getByText("45")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="vo2max"]')!).getByText("58")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "VO2max 전체 코호트 백분위" })).toHaveAttribute("aria-valuenow", "75");
    expect(within(container.querySelector('[data-performance-metric="vo2max"]')!).getByText("백분위 75")).toBeInTheDocument();
    expect(screen.getByText("실제 O-Rider 전체 코호트 기준")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /월별 추정 FTP 추이 차트:.*255W.*265W/ })).toBeInTheDocument();

    const evidenceButton = screen.getByRole("button", { name: "산출 근거 보기" });
    expect(evidenceButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/최근 90일 PDC · Coggan 남성 파워 프로파일/)).not.toBeVisible();
    expect(onApply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "이 후보 적용" }));
    expect(onApply).toHaveBeenCalledWith(265);
    await user.click(evidenceButton);
    expect(screen.getByRole("button", { name: "산출 근거 닫기" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("최근 20분 최고 평균")).toBeVisible();
    expect(screen.getByText("279 W")).toBeVisible();
    expect(screen.getByText("최근 eFTP 산출 월")).toBeVisible();
    expect(screen.getByText("2026-07")).toBeVisible();
    expect(screen.getByText("PDC 분석 활동")).toBeVisible();
    expect(screen.getByText("14개")).toBeVisible();
    expect(screen.getByText("현재 적용 FTP 대비 eFTP")).toBeVisible();
    expect(screen.getByText("+15 W")).toBeVisible();
    expect(screen.getByText("라이더 유형 신뢰도")).toBeVisible();
    expect(screen.getByText("80%")).toBeVisible();
    expect(screen.getByText(/최근 90일 PDC · Coggan 남성 파워 프로파일/)).toBeVisible();
    expect(screen.getByRole("link", { name: "PDC와 3축 산출 근거 보기" })).toHaveAttribute("href", "/web-manual/ch06-advanced.html#s6-3");
  });

  it("shows a stable empty state without inventing estimates", () => {
    const { container } = renderWithProviders(
      <BikePerformanceSummaryCard applying={false} onApplyCandidate={vi.fn()} />,
    );

    expect(screen.getByText("라이더 유형 근거 부족")).toBeInTheDocument();
    expect(screen.getByText("백분위 근거 부족")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    const metricTiles = container.querySelectorAll('[data-performance-metric]');
    expect(metricTiles).toHaveLength(4);
    metricTiles.forEach((tile) => expect(within(tile as HTMLElement).getByText("근거 부족")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "이 후보 적용" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /월별 추정 FTP 추이 차트/ })).not.toBeInTheDocument();
  });

  it("labels partial PDC data without filling missing metrics", () => {
    const { container } = renderWithProviders(
      <BikePerformanceSummaryCard
        decision={{ ...completeDecision, automaticCandidateW: null, latestMonthlyEstimate: null, tteMin: null, cpW: 245 }}
        pdc={{ riderType: null, abilityPercentile: null, vo2maxEst: 52.2, vo2maxPercentile: null, activityCount: 4 }}
        applying={false}
        onApplyCandidate={vi.fn()}
      />,
    );

    expect(screen.getByText("체중 입력 시 W/kg 표시")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="cp"]')!).getByText("245")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="vo2max"]')!).getByText("52")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="eftp"]')!).getByText("—")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="tte"]')!).getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("reports missing FTP instead of blaming weight when weight is present", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BikePerformanceSummaryCard
        decision={{ ...completeDecision, activeFtpW: null, automaticCandidateW: null }}
        weightKg={70}
        applying={false}
        onApplyCandidate={vi.fn()}
      />,
    );

    expect(screen.getByText("프로필 FTP를 먼저 설정하세요")).toBeInTheDocument();
    expect(screen.queryByText("체중 입력 시 W/kg 표시")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "산출 근거 보기" }));
    expect(screen.getByText(/현재 적용할 프로필 FTP가 없어/)).toBeVisible();
  });
});
