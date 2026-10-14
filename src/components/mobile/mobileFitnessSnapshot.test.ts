import { createElement } from "react";
import fs from "node:fs";
import path from "node:path";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { BikeThresholdDecisionV2 } from "@shared/types/threshold";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import BikePerformanceSummaryCard from "./BikePerformanceSummaryCard";
import IntegratedLoadCard from "./IntegratedLoadCard";

const decision = {
  activeFtpW: 250, automaticCandidateW: 265, cpW: 270, recentTwentyMinuteW: 279,
  latestMonthlyEstimate: { period: "2026-07", ftpW: 265 }, tteMin: 45, activityCount: 14,
};
const ftpDecision: BikeThresholdDecisionV2 = {
  schemaVersion: 2, decisionId: "bike-ftp-1234567890abcdef1234567890abcdef", status: "actionable",
  candidate: { ftp: 265, currentFtp: 250, method: "pdc_cp_097", deltaW: 15, deltaPct: 6 },
  evidence: { activityId: "activity-1", activityRevision: "activity-r1", powerSource: "measured", pdcRevision: "pdc-r1" },
  expectedRevisions: { ftp: "ftp-r1", pdc: "pdc-r1", impactPreview: "impact-r1" },
  confidence: { level: "high", score: 0.9, reasons: ["measured_power"] },
  impactPreview: { revision: "impact-r1", effectiveFrom: "next_ride", workoutScalePct: 106 },
  createdAt: Date.now() - 1_000, expiresAt: Date.now() + 86_400_000,
};

describe("mobile fitness decision hierarchy", () => {
  it("keeps canonical FTP before rider, metrics, estimates, server decision and collapsed evidence", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(createElement(BikePerformanceSummaryCard, {
      decision, ftpDecision, weightKg: 70,
      pdc: { riderType: { type: "Climber", confidence: 0.9 }, abilityScore: 82, vo2maxEst: 58,
        activityCount: 14, weightKgSnapshot: 70, version: 6, provenanceVersion: 2, measuredPower: true },
      progression: [{ period: "2026-06", ftpW: 255, source: "20m" }, { period: "2026-07", ftpW: 265, source: "20m" }],
    }));
    const hero = container.querySelector(".mobile-fitness-performance__ftp")!;
    expect(within(hero as HTMLElement).getByText("250")).toBeInTheDocument();
    expect(screen.getByText("3.57 W/kg")).toBeInTheDocument();
    const rider = screen.getByText("클라이머");
    const metrics = container.querySelector(".mobile-fitness-performance__metrics")!;
    expect(metrics.querySelectorAll("[data-performance-metric]")).toHaveLength(4);
    expect(within(metrics as HTMLElement).getByText("270")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "종합 사이클링 역량 점수" })).toHaveAttribute("aria-valuenow", "82");
    const trend = container.querySelector(".mobile-fitness-performance__trend")!;
    expect(within(trend as HTMLElement).getByRole("img", { name: /255W.*265W/ })).toBeInTheDocument();
    const candidate = screen.getByTestId("K1-6-1");
    expect(within(candidate).getByRole("button", { name: "이 FTP로 변경" })).toBeInTheDocument();
    const evidence = screen.getByRole("button", { name: "산출 근거 보기" });
    const ordered = [hero, rider, metrics, trend, candidate, evidence];
    ordered.slice(1).forEach((node, index) => {
      expect(ordered[index].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(evidence).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/CTL|ATL|TSB/)).not.toBeInTheDocument();
    await user.click(evidence);
    expect(evidence).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/최근 90일 PDC의 CP\/5분 파워와 체중 기반 추정/)).toBeVisible();
    const css = fs.readFileSync(path.resolve("src/components/mobile/MobileFitnessPage.css"), "utf8");
    expect(css).toMatch(/\.mobile-fitness-performance__metrics\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("keeps the legacy VO2 estimate while the analysis partition delegates VO2 to its dedicated panel", () => {
    const { container, rerender } = renderWithProviders(createElement(BikePerformanceSummaryCard, { decision, weightKg: 70 }));
    expect(within(container.querySelector('[data-performance-metric="vo2max"]') as HTMLElement).getByText("60")).toBeInTheDocument();
    rerender(createElement(BikePerformanceSummaryCard, { decision, weightKg: 70, part: "analysis" }));
    expect(container.querySelector('[data-performance-metric="vo2max"]')).toBeNull();
    expect(container.querySelectorAll("[data-performance-metric]")).toHaveLength(3);
    expect(container.querySelector(".mobile-fitness-performance__ftp")).toBeNull();
  });

  it("keeps integrated load visible and its calculation evidence in a closed disclosure", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(createElement(IntegratedLoadCard, {
      combined: { ctl: 40, atl: 45, tsb: -5, contributions: [{ discipline: "bike", ctl: 40 }] },
      focus: { windowDays: 28, totalLoad: 100, buckets: { baseAerobic: 100, highAerobic: 0, highIntensity: 0, unclassified: 0 },
        sourceLoad: { power: 100, heartRate: 0, unclassified: 0 }, disciplineLoad: { bike: 100, run: 0, swim: 0, other: 0 },
        activityCount: 5, coveragePct: 100, confidence: "high", hasAnaerobicBikeDetail: false },
    }));
    expect(screen.getByText("40.0")).toBeVisible();
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    const summary = within(details).getByText("계산 방법과 해석 근거");
    expect(summary).toHaveStyle({ minHeight: "44px" });
    const source = within(details).getByText("사이클·러닝·수영을 합쳐 서버에서 계산한 CTL · ATL · TSB");
    expect(source).not.toBeVisible();
    await user.click(summary);
    expect(details).toHaveAttribute("open");
    expect(source).toBeVisible();
  });
});
