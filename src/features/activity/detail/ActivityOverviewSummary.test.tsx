import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18n from "i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import enActivity from "../../../i18n/resources/en/activity.json";
import ActivityOverviewSummary, { ActivityOverviewSummaryContent } from "./ActivityOverviewSummary";

afterEach(async () => { cleanup(); await i18n.changeLanguage("ko"); });
const rich: ActivityOverviewPresentation = {
  coachSentence: "내 기준에서 지속출력이 돋보인 라이딩이었어요.", session: { discipline: "bike", character: "interval", distanceKm: 100, load: 279, normalizedPowerW: 164 },
  availability: { personal: "available", records: "evaluated", power: "available", heartRate: "available" },
  comparisonMetadata: { windowDays: 90, character: "interval", priorSampleCount: 10, historyCompleteness: "complete" },
  personal: [{ axis: "sessionLoad", personalIndex: 100, band: "higher", sampleCount: 10 }, { axis: "muscularLoad", personalIndex: 80, band: "higher", sampleCount: 9 }],
  zones: [{ kind: "power", seconds: [75, 0, 0, 25], priority: "primary", baselinePercentages: [60, 0, 0, 40], deltaPercentagePoints: [15, 0, 0, -15], priorSampleCount: 10 }],
  powerFingerprint: [{ duration: "2m", watts: 288, deltaPct: 19.3, medianWatts: 241, priorSampleCount: 10, competitionRank: 1 }, { duration: "5m", watts: 219, recordAchievement: "new" }],
  thresholdWork: { matchesCount: 0, matchesTotalSec: 0, longestZ4PlusSec: 59.8, wPrimeRemainingPct: 0 },
  recovery: { hours: 72, load: 279 }, energy: { totalKcal: 1520, fatPct: 18, carbPct: 82 },
  priorFitnessStatus: { asOf: "2026-09-12 09:00 KST", ctl: 37.4, atl: 42, tsb: -4.6, formBand: "productive" },
  sportDetails: [{ label: "분석 기준 FTP", value: "182 W", priority: "primary" }], qualityNote: true,
};

describe("ActivityOverviewSummary", () => {
  it("renders the four share-summary sections without analysis tables or basic activity stats", () => {
    render(<ActivityOverviewSummaryContent presentation={rich} />);
    for (const title of ["훈련 자극", "나의 변화", "회복과 연료", "시작 전 상태"]) expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(rich.coachSentence)).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("0회 · 0분 0초")).toBeInTheDocument();
    expect(screen.getByText("1분 0초")).toBeInTheDocument();
    expect(screen.getByText("피크 파워 변화 · 2분")).toBeInTheDocument();
    expect(screen.getByText("+19.3% · 10회")).toBeInTheDocument();
    expect(screen.getByText("전체 기간 PR")).toBeInTheDocument();
    expect(screen.queryByText(/분석 기준 FTP 182 W/)).not.toBeInTheDocument();
    expect(screen.queryByText("근육 부하")).not.toBeInTheDocument();
    expect(screen.queryByText("1520")).not.toBeInTheDocument();
    expect(screen.getByText(/직접 측정한 생리값/)).toBeInTheDocument();
  });
  it("shows the user-approved-value caveat as a separate caption only when qualityNote is true", () => {
    const { rerender } = render(<ActivityOverviewSummaryContent presentation={rich} />);
    const modelNote = screen.getByText("회복·연료·W′는 계측값을 바탕으로 한 모델이며 직접 측정한 생리값은 아닙니다.");
    const qualityNote = screen.getByText("※ 사용자 승인값이 없으면 계측값을 사용합니다.");
    expect(modelNote).not.toBe(qualityNote);
    expect(modelNote).toHaveClass("ds-text--caption");
    expect(qualityNote).toHaveClass("ds-text--caption");
    rerender(<ActivityOverviewSummaryContent presentation={{ ...rich, qualityNote: false }} />);
    expect(screen.queryByText("※ 사용자 승인값이 없으면 계측값을 사용합니다.")).not.toBeInTheDocument();
    expect(screen.getByText(modelNote.textContent!)).toBeInTheDocument();
  });
  it("uses the equivalent English caveat", async () => {
    i18n.addResourceBundle("en", "activity", enActivity, true, true);
    await i18n.changeLanguage("en");
    render(<ActivityOverviewSummaryContent presentation={rich} />);
    expect(screen.getByText("※ Measured values are used when user-approved values are unavailable.")).toBeInTheDocument();
  });
  it("uses one design-system card and quiet dividers rather than numbered inset panels", () => {
    render(<ActivityOverviewSummary overview={{ enabled: true, loading: false, response: { status: "available", activityId: "a", presentation: rich }, error: false, retry: vi.fn() }} />);
    const summary = screen.getByTestId("activity-overview-summary");
    expect(summary).toHaveClass("ds-card");
    expect(summary.querySelectorAll(".ds-card")).toHaveLength(0);
    expect(summary.querySelectorAll("section.border-t")).toHaveLength(4);
    expect(summary.querySelector(".ds-card--inset")).not.toBeInTheDocument();
    expect(screen.queryByText(/^0[1-4]$/)).not.toBeInTheDocument();
    expect(screen.queryByText("라이딩")).not.toBeInTheDocument();
  });
  it("shows every verified PR and only the strongest personal comparisons", () => {
    render(<ActivityOverviewSummaryContent presentation={{ ...rich, powerFingerprint: [
      ...rich.powerFingerprint!,
      { duration: "10m", watts: 204, deltaPct: 8, medianWatts: 180, priorSampleCount: 10, recordAchievement: "new" },
      { duration: "20m", watts: 190, deltaPct: 6, medianWatts: 170, priorSampleCount: 10, recordAchievement: "new" },
    ] }} />);
    expect(screen.getByText("5분 · 219 W")).toBeInTheDocument();
    expect(screen.getByText("10분 · 204 W")).toBeInTheDocument();
    expect(screen.getByText("20분 · 190 W")).toBeInTheDocument();
    expect(screen.getByText("+19.3% · 10회")).toBeInTheDocument();
    expect(screen.queryByText("+8% · 10회")).not.toBeInTheDocument();
    expect(screen.queryByText(/Z1 \+15/)).not.toBeInTheDocument();
  });
  it.each(["bike", "run", "swim"] as const)("keeps the same frame for missing %s inputs", (discipline) => {
    render(<ActivityOverviewSummaryContent presentation={{ coachSentence: "짧은 활동", session: { discipline }, thresholdWork: {}, availability: { personal: "character_uncertain", records: "unavailable", power: "unavailable", heartRate: "unavailable" } }} />);
    expect(screen.getAllByRole("region")).toHaveLength(4);
    expect(screen.getByText("이번 활동의 자극 분석 정보가 아직 없어요.")).toBeInTheDocument();
    expect(screen.getByText(/성격이 불명확/)).toBeInTheDocument();
    expect(screen.queryByText("전체 기간 PR")).not.toBeInTheDocument();
  });
  it("does not promote window rank to PR or disclose private power", () => {
    const { rerender } = render(<ActivityOverviewSummaryContent presentation={{ ...rich, availability: { ...rich.availability!, records: "unavailable" } }} />);
    expect(screen.queryByText("전체 기간 PR")).not.toBeInTheDocument();
    rerender(<ActivityOverviewSummaryContent presentation={{ ...rich, availability: { ...rich.availability!, power: "private", records: "private" } }} />);
    for (const text of ["25", "18", "82", "전체 기간 PR", "피크 파워 변화 · 2분"]) expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.queryByText(/분석 기준 FTP 182 W/)).not.toBeInTheDocument();
  });
  it("does not highlight comparisons from incomplete history", () => {
    render(<ActivityOverviewSummaryContent presentation={{ ...rich, comparisonMetadata: { ...rich.comparisonMetadata!, historyCompleteness: "incomplete" } }} />);
    expect(screen.queryByText("+19.3% · 10회")).not.toBeInTheDocument();
    expect(screen.queryByText(/Z1 \+15/)).not.toBeInTheDocument();
    expect(screen.getByText("전체 기간 PR")).toBeInTheDocument();
  });
  it("preserves owner, loading, retry and rollout states", () => {
    const overview = { enabled: false, loading: false, response: null, error: false, retry: vi.fn() };
    const { rerender } = render(<ActivityOverviewSummary overview={overview} />);
    expect(screen.queryByTestId("activity-overview-summary")).not.toBeInTheDocument();
    rerender(<ActivityOverviewSummary overview={{ ...overview, enabled: true, loading: true }} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<ActivityOverviewSummary overview={{ ...overview, enabled: true, error: true }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(overview.retry).toHaveBeenCalledOnce();
    rerender(<ActivityOverviewSummary overview={{ ...overview, enabled: true, response: { status: "unavailable", activityId: "a", reason: "rollout_disabled" } }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("activity overview summary for a viewer", () => {
  const overview = { enabled: true, loading: false, response: null, error: false, retry: vi.fn() };
  it("uses the rider voice instead of the owner voice", () => {
    render(<ActivityOverviewSummaryContent presentation={rich} isOwner={false} />);
    expect(screen.getByText("이 라이더의 변화")).toBeInTheDocument();
    expect(screen.queryByText("나의 변화")).not.toBeInTheDocument();
  });
  it("shows the card only when the server actually returned an overview", () => {
    const { rerender } = render(<ActivityOverviewSummary overview={{ ...overview, loading: true }} isOwner={false} />);
    expect(screen.queryByTestId("activity-overview-summary")).not.toBeInTheDocument();
    for (const state of [{ error: true }, { response: { status: "unavailable" as const, activityId: "a", reason: "metrics_unavailable" as const } }]) {
      rerender(<ActivityOverviewSummary overview={{ ...overview, ...state }} isOwner={false} />);
      expect(screen.queryByTestId("activity-overview-summary")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    }
    rerender(<ActivityOverviewSummary overview={{ ...overview, response: { status: "available", activityId: "a", version: "activity-overview-v1", inputDigest: "d", presentation: rich } }} isOwner={false} />);
    expect(screen.getByTestId("activity-overview-summary")).toBeInTheDocument();
  });
});
