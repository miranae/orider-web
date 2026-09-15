import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import ActivityOverviewEvidence, { ActivityOverviewEvidenceContent } from "./ActivityOverviewEvidence";

afterEach(cleanup);
const rich: ActivityOverviewPresentation = {
  coachSentence: "지속출력이 돋보인 활동", session: { discipline: "bike", character: "interval", classificationReason: "같은 유형 대비", load: 160, intensityFactor: 0.9, normalizedPowerW: 180 },
  availability: { personal: "available", power: "available", heartRate: "available", records: "evaluated" },
  comparisonMetadata: { windowDays: 90, character: "interval", priorSampleCount: 10, historyCompleteness: "complete" },
  personal: [{ axis: "sessionLoad", personalIndex: 100, band: "higher", sampleCount: 10 }, { axis: "muscularLoad", personalIndex: 80, band: "higher", sampleCount: 8 }],
  powerFingerprint: [{ duration: "2m", watts: 288, medianWatts: 242, deltaPct: 19.3, competitionRank: 1, priorSampleCount: 10 }, { duration: "5m", watts: 219, recordAchievement: "new" }],
  zones: [{ kind: "power", seconds: [10, 20, 30, 40, 0, 0, 0], currentPercentages: [10, 20, 30, 40, 0, 0, 0], baselinePercentages: [20, 20, 20, 40, 0, 0, 0], deltaPercentagePoints: [-10, 0, 10, 0, 0, 0, 0], priorSampleCount: 8, priority: "primary" }],
  thresholdWork: { matchesCount: 0, matchesTotalSec: 0, longestZ4PlusSec: 40, anaerobicSec: 0, wPrimeDepletionPct: 100, wPrimeRemainingPct: 0 },
  recovery: { hours: 48, load: 160, ctl: 37 }, energy: { totalKcal: 1000, fatKcal: 175, carbKcal: 825, fatPct: 17.5, carbPct: 82.5 },
  priorFitnessStatus: { asOf: "2026-09-12 09:00 KST", ctl: 37, atl: 42, tsb: -5, formBand: "productive" }, sportDetails: [{ label: "분석 기준 FTP", value: "182 W", priority: "primary" }], qualityNote: true,
};

describe("activity overview evidence", () => {
  it("keeps loading, retry and rollout-disabled states in the overview variant", () => {
    const overview = { enabled: true, loading: true, response: null, error: false, retry: vi.fn() };
    const { rerender } = render(<ActivityOverviewEvidence overview={overview} variant="overview" />);
    expect(screen.getByRole("heading", { name: "오라이더 활동개요" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<ActivityOverviewEvidence overview={{ ...overview, loading: false, error: true }} variant="overview" />);
    fireEvent.click(screen.getByRole("button"));
    expect(overview.retry).toHaveBeenCalledOnce();
    rerender(<ActivityOverviewEvidence overview={{ ...overview, loading: false, response: { status: "unavailable", activityId: "a", reason: "rollout_disabled" } }} variant="overview" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(rich.coachSentence)).not.toBeInTheDocument();
  });
  it("shows measured zone percentages without comparison history", () => {
    render(<ActivityOverviewEvidenceContent presentation={{ coachSentence: "short", session: { discipline: "bike" }, zones: [{ kind: "power", seconds: [25, 75, 0, 0, 0, 0, 0], priority: "primary" }] }} />);
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
  it("renders full canonical evidence, zeros, exact cutoff and only awarded PR", () => {
    render(<ActivityOverviewEvidenceContent presentation={rich} />);
    for (const text of ["지속출력이 돋보인 활동", "근육 부하", "+19.3%", "242 W", "182 W", "2026-09-12 09:00 KST", "17.5% · 175 kcal"]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getAllByText("전체 기간 PR")).toHaveLength(1);
    expect(screen.getByText(/활동 이전 90일/)).toBeInTheDocument();
    expect(screen.getAllByText("0 s").length).toBeGreaterThan(0);
  });
  it.each(["bike", "run", "swim"] as const)("keeps sections with missing %s inputs without inventing zero values", (discipline) => {
    render(<ActivityOverviewEvidenceContent presentation={{ coachSentence: "짧은 활동", session: { discipline } }} />);
    expect(screen.getByText("내 기록 대비")).toBeInTheDocument();
    expect(screen.getByText("회복과 에너지 모델")).toBeInTheDocument();
    expect(screen.queryByText("0 s")).not.toBeInTheDocument();
    expect(screen.queryByText("전체 기간 PR")).not.toBeInTheDocument();
  });
  it("does not turn window rank one or pending receipts into PRs and respects hidden channels", () => {
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich, sportDetails: [], availability: { ...rich.availability!, power: "private", records: "unavailable" } }} />);
    expect(screen.queryByText("288")).not.toBeInTheDocument();
    expect(screen.queryByText("전체 기간 PR")).not.toBeInTheDocument();
    expect(screen.getByText(/개인기록 검증 대기/)).toBeInTheDocument();
  });
  it("hides owner-only panel entirely and does not retry disabled rollout", () => {
    const overview = { enabled: false, loading: false, response: null, error: false, retry: vi.fn() };
    const { rerender } = render(<ActivityOverviewEvidence overview={overview} />);
    expect(screen.queryByTestId("activity-overview-evidence")).not.toBeInTheDocument();
    rerender(<ActivityOverviewEvidence overview={{ ...overview, enabled: true, response: { status: "unavailable", activityId: "a", reason: "rollout_disabled" } }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
