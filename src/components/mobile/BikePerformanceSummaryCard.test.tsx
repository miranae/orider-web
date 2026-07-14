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
        pdc={{
          riderType: { type: "Climber", confidence: 0.8 }, abilityPercentile: 82, ttePercentile: 62, vo2maxEst: 58.4, vo2maxPercentile: 75, activityCount: 14,
          cohortComputedAt: Date.UTC(2026, 6, 14),
          cohortDistributions: {
            overallAbility: {
              basis: "coggan_score_v1", domain: [0, 100], approximateSampleSize: 120,
              bins: [{ from: 0, to: 50, densityLevel: 3 }, { from: 50, to: 100, densityLevel: 5 }],
              privacy: { minimumCellSize: 5, exactCountsPublished: false, method: "adjacent_merge_relative_density_v1" },
              computedAt: Date.UTC(2026, 6, 14),
            },
            vo2max: {
              basis: "vo2max_ml_kg_min", domain: [20, 95], approximateSampleSize: 120,
              bins: [{ from: 20, to: 50, densityLevel: 5 }, { from: 50, to: 95, densityLevel: 2 }],
              privacy: { minimumCellSize: 5, exactCountsPublished: false, method: "adjacent_merge_relative_density_v1" },
              computedAt: Date.UTC(2026, 6, 14),
            },
          },
        }}
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
    expect(screen.getByRole("meter", { name: "종합 사이클링 역량 백분위" })).toHaveAttribute("aria-valuetext", "백분위 82");
    expect(screen.queryByText("상위 18%")).not.toBeInTheDocument();
    expect(screen.getAllByText(/실제 인구 밀도 분포가 아닙니다/).filter((node) => !node.closest(".sr-only"))).toHaveLength(1);
    expect(screen.getAllByText("O-Rider 전체 · 약 120명")).toHaveLength(2);
    expect(screen.getAllByText(/5명 미만 구간 병합 · 정확한 인원 수 비공개/)).toHaveLength(2);
    expect(screen.getByText("Coggan 남성 파워 프로파일 v1 기준 · 성별·연령 미보정")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="eftp"]')!).getByText("265")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="cp"]')!).getByText("270")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="tte"]')!).getByText("45")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "TTE 전체 코호트 백분위" })).toHaveAttribute("aria-valuenow", "62");
    const tteMeter = screen.getByRole("meter", { name: "TTE 전체 코호트 백분위" });
    const tteDescription = document.getElementById(tteMeter.getAttribute("aria-describedby")!);
    expect(tteDescription).toHaveTextContent(/분포 데이터가 없어/);
    expect(tteDescription).not.toHaveTextContent(/상대 밀도/);
    expect(within(container.querySelector('[data-performance-metric="tte"]')!).getByText("백분위 62")).toBeInTheDocument();
    const vo2Tile = container.querySelector('[data-performance-metric="vo2max"]')!;
    expect(within(vo2Tile).getByText("58")).toHaveStyle({ whiteSpace: "nowrap" });
    expect(within(vo2Tile).getByText("ml/kg/min")).toHaveStyle({ whiteSpace: "nowrap" });
    expect(screen.getByRole("meter", { name: "VO2max 전체 코호트 백분위" })).toHaveAttribute("aria-valuenow", "75");
    const vo2Meter = screen.getByRole("meter", { name: "VO2max 전체 코호트 백분위" });
    const vo2Description = document.getElementById(vo2Meter.getAttribute("aria-describedby")!);
    expect(vo2Description).toHaveTextContent(/상대 밀도/);
    expect(vo2Description).not.toHaveTextContent(/분포 데이터가 없어/);
    expect(within(container.querySelector('[data-performance-metric="vo2max"]')!).getByText("백분위 75")).toBeInTheDocument();
    expect(screen.getByText("TTE·VO2max · 실제 O-Rider 전체 코호트 기준")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="tte"]')!).queryByText(/O-Rider 전체/)).not.toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="vo2max"]')!).queryByText(/O-Rider 전체/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/분포 데이터가 없어 백분위 위치만 표시합니다/).filter((node) => !node.closest(".sr-only"))).toHaveLength(1);
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

  it("does not describe a TTE-only percentile with an unrelated VO2max density", () => {
    renderWithProviders(
      <BikePerformanceSummaryCard
        decision={{ ...completeDecision, automaticCandidateW: null }}
        pdc={{
          riderType: null,
          abilityPercentile: null,
          ttePercentile: 60,
          vo2maxEst: 52,
          vo2maxPercentile: null,
          activityCount: 4,
          cohortDistributions: {
            vo2max: {
              basis: "vo2max_ml_kg_min",
              domain: [20, 95],
              approximateSampleSize: 120,
              bins: [{ from: 20, to: 95, densityLevel: 5 }],
              privacy: { minimumCellSize: 5, exactCountsPublished: false, method: "adjacent_merge_relative_density_v1" },
              computedAt: Date.UTC(2026, 6, 14),
            },
          },
        }}
        applying={false}
        onApplyCandidate={vi.fn()}
      />,
    );

    expect(screen.getByText("실제 O-Rider 전체 코호트 기준")).toBeInTheDocument();
    expect(screen.queryByText(/O-Rider 추정 VO2max 분포/)).not.toBeInTheDocument();
    expect(screen.queryByText(/상대 밀도/)).not.toBeInTheDocument();
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
