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
  recovery: { hours: 48, load: 160, ctl: 37 }, energy: { totalKcal: 1000, fatKcal: 175, carbKcal: 825, fatPct: 17.5, carbPct: 82.5, fatGrams: 19.4 },
  priorFitnessStatus: { asOf: "2026-09-12 09:00 KST", ctl: 37, atl: 42, tsb: -5, formBand: "productive" }, sportDetails: [{ label: "분석 기준 FTP", value: "182 W", priority: "primary" }], qualityNote: true,
};

describe("activity overview evidence", () => {
  it("uses analysis-native metric cards and keyboard-scrollable comparison tables", () => {
    const { container } = render(<ActivityOverviewEvidenceContent presentation={rich} />);
    expect(screen.getByText("NP").closest(".ds-card")).toHaveClass("ds-card--inset");
    expect(screen.getByText("NP").closest("section")).toHaveAccessibleName("훈련 자극과 분석 기준");
    for (const table of screen.getAllByRole("table")) {
      expect(table.parentElement).toHaveAttribute("tabindex", "0");
      expect(table.querySelector("th")).toHaveAttribute("scope", "col");
    }
    expect(container.querySelector("dl")).toBeNull();
    expect(screen.getByText("전체 기간 PR")).toHaveClass("ds-chip--accent");
  });
  it("keeps loading, retry and rollout-disabled states in analysis", () => {
    const overview = { enabled: true, loading: true, response: null, error: false, retry: vi.fn() };
    const { rerender } = render(<ActivityOverviewEvidence overview={overview} />);
    expect(screen.getByRole("heading", { name: "활동개요 평가 근거" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<ActivityOverviewEvidence overview={{ ...overview, loading: false, error: true }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(overview.retry).toHaveBeenCalledOnce();
    rerender(<ActivityOverviewEvidence overview={{ ...overview, loading: false, response: { status: "unavailable", activityId: "a", reason: "rollout_disabled" } }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(rich.coachSentence)).not.toBeInTheDocument();
  });
  it("shows server-computed zone percentages without comparison history and never divides seconds itself", () => {
    // 비중은 서버 정본(currentPercentages)에서만 온다 — 없으면 화면이 초를 나눠 만들어내지 않는다.
    render(<ActivityOverviewEvidenceContent presentation={{ coachSentence: "short", session: { discipline: "bike" }, zones: [{ kind: "power", seconds: [25, 75, 0, 0, 0, 0, 0], priority: "primary", currentPercentages: [25, 75, 0, 0, 0, 0, 0] }] }} />);
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    cleanup();
    render(<ActivityOverviewEvidenceContent presentation={{ coachSentence: "short", session: { discipline: "bike" }, zones: [{ kind: "power", seconds: [25, 75, 0, 0, 0, 0, 0], priority: "primary" }] }} />);
    expect(screen.queryByText("25%")).not.toBeInTheDocument();
  });
  it("renders full canonical evidence, zeros, exact cutoff and only awarded PR", () => {
    render(<ActivityOverviewEvidenceContent presentation={rich} />);
    for (const text of ["지속출력이 돋보인 활동", "근육 부하", "+19.3%", "242 W", "182 W", "2026-09-12 09:00 KST", "17.5% · 175 kcal"]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getAllByText("전체 기간 PR")).toHaveLength(1);
    expect(screen.getByText(/활동 이전 90일/)).toBeInTheDocument();
    expect(screen.getAllByText("0 s").length).toBeGreaterThan(0);
  });
  it("shows the highlight, anaerobic work, load index, all-time best, baseline scope and fat grams from the same presentation", () => {
    const value: ActivityOverviewPresentation = { ...rich,
      highlight: { kind: "sustained", reason: "20분 최고 출력 · 전체 기간 PR" }, aboveUsualVolume: true,
      thresholdWork: { ...rich.thresholdWork, aboveFtpKj: 72.4 },
      powerFingerprint: [{ duration: "2m", watts: 288, allTimeBestWatts: 320, allTimeBestPct: 90, medianWatts: 242, deltaPct: 19.3, competitionRank: 1, priorSampleCount: 10 },
        { duration: "5m", watts: 219, allTimeBestWatts: 219, allTimeBestPct: 100, recordAchievement: "new" }, { duration: "1s", watts: 845 }],
      zones: [{ ...rich.zones![0]!, baselineScope: "discipline" }],
    };
    render(<ActivityOverviewEvidenceContent presentation={value} />);
    expect(screen.getByText("하이라이트 · 20분 최고 출력 · 전체 기간 PR")).toBeInTheDocument();
    expect(screen.getByText("고강도 반복 · 평소보다 많이")).toBeInTheDocument();
    expect(screen.getByText("72.4 kJ")).toBeInTheDocument();
    expect(screen.getByText("오늘 부하 지수 100 · 같은 유형 내 90일 상위 1%")).toBeInTheDocument();
    // 역대 최고 열: 320 W 대비 90%, 이번이 최고면 100%, 서버가 비운 구간은 —.
    expect(screen.getByText("320 W")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    // 100% 는 무산소 최대소진 카드에도 있으므로 표 셀까지 합쳐 둘 이상이어야 한다.
    expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/클램프·글리치로 판정된 구간은 비워 둡니다/)).toBeInTheDocument();
    expect(screen.getByText("기준: 종목 전체 (같은 유형 표본 부족)")).toBeInTheDocument();
    expect(screen.getByText("19.4 g")).toBeInTheDocument();
    cleanup();
    // 지형 라벨은 서버가 정한 값만 보여준다.
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich, routeLoad: { climbCount: 3, highestCategory: "Cat2", terrain: "climbing" } }} />);
    expect(screen.getByText("업힐 위주")).toBeInTheDocument();
    cleanup();
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich, routeLoad: { climbCount: 0 } }} />);
    expect(screen.queryByText("업힐 위주")).not.toBeInTheDocument();
    expect(screen.queryByText("평지 위주")).not.toBeInTheDocument();
  });

  it("keeps the best columns blank and the baseline chip absent when records are unavailable or there is no comparison", () => {
    const value: ActivityOverviewPresentation = { ...rich, availability: { ...rich.availability!, records: "unavailable" },
      powerFingerprint: [{ duration: "2m", watts: 288, allTimeBestWatts: 320, allTimeBestPct: 90 }], zones: [{ kind: "power", seconds: [10, 20, 30, 40, 0, 0, 0], priority: "primary", currentPercentages: [10, 20, 30, 40, 0, 0, 0] }] };
    render(<ActivityOverviewEvidenceContent presentation={value} />);
    expect(screen.queryByText("320 W")).not.toBeInTheDocument();
    expect(screen.queryByText("90%")).not.toBeInTheDocument();
    expect(screen.queryByText(/^기준:/)).not.toBeInTheDocument();
    expect(screen.queryByText("하이라이트", { exact: false })).not.toBeInTheDocument();
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

describe("activity overview evidence viewer voice", () => {
  it("attributes the personal comparison to the rider when the viewer is not the owner", () => {
    render(<ActivityOverviewEvidenceContent presentation={rich} isOwner={false} />);
    expect(screen.getByText("이 라이더의 기록 대비")).toBeInTheDocument();
    expect(screen.queryByText("내 기록 대비")).not.toBeInTheDocument();
    expect(screen.getByText(/이 라이더의 기록 안에서의 상대 위치/)).toBeInTheDocument();
  });

  it("keeps the owner voice for the owner", () => {
    render(<ActivityOverviewEvidenceContent presentation={rich} />);
    expect(screen.getByText("내 기록 대비")).toBeInTheDocument();
  });
});
