import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import ActivityOverviewEvidence, { ActivityOverviewEvidenceContent } from "./ActivityOverviewEvidence";

// Tooltip triggers split visible sentences across descendants; assert the same full text.
function renderedText(expected: string | RegExp, exact = true) {
  const matches = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    return typeof expected === "string" ? exact ? normalized === expected : normalized.toLowerCase().includes(expected.toLowerCase()) : expected.test(normalized);
  };
  return (content: string, node: Element | null) => matches(content) || !!node && matches(node.textContent ?? "") && !Array.from(node.children).some(child => matches(child.textContent ?? ""));
}

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
  it("labels evaluated comparisons without visible records as empty", () => {
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich, powerFingerprint: [], runRecordAchievements: [] }} />);
    expect(screen.getByText(renderedText("개인기록 비교를 확인했지만 표시할 수 있는 기록이 없습니다."))).toBeInTheDocument();
    expect(screen.queryByText(renderedText("개인기록 검증 완료"))).not.toBeInTheDocument();
  });
  it("labels displayed comparisons without creating extra PR achievements", () => {
    render(<ActivityOverviewEvidenceContent presentation={rich} />);
    expect(screen.getByText(renderedText("표시된 기록의 개인기록 비교를 확인했습니다."))).toBeInTheDocument();
    expect(screen.getAllByText("전체 기간 PR")).toHaveLength(1);
  });
  it("does not count absent power or inapplicable running rows as visible evidence", () => {
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich, powerFingerprint: [], runRecordAchievements: [{ distance: "5km", valueSec: 1200, recordAchievement: "new" }] }} />);
    expect(screen.getByText(renderedText("개인기록 비교를 확인했지만 표시할 수 있는 기록이 없습니다."))).toBeInTheDocument();
    expect(screen.queryByText(renderedText("5km"))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText("전체 기간 PR"))).not.toBeInTheDocument();
  });
  it("uses analysis-native metric cards and keyboard-scrollable comparison tables", () => {
    const { container } = render(<ActivityOverviewEvidenceContent presentation={rich} />);
    expect(screen.getByText(renderedText("NP")).closest(".ds-card")).toHaveClass("ds-card--inset");
    expect(screen.getByText(renderedText("NP")).closest("section")).toHaveAccessibleName("훈련 자극과 분석 기준");
    for (const table of screen.getAllByRole("table")) {
      expect(table.parentElement).toHaveAttribute("tabindex", "0");
      expect(table.querySelector("th")).toHaveAttribute("scope", "col");
    }
    expect(container.querySelector("dl")).toBeNull();
    expect(screen.getByText(renderedText("전체 기간 PR"))).toHaveClass("ds-chip--accent");
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
    expect(screen.getByText(renderedText("25%"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("75%"))).toBeInTheDocument();
    cleanup();
    render(<ActivityOverviewEvidenceContent presentation={{ coachSentence: "short", session: { discipline: "bike" }, zones: [{ kind: "power", seconds: [25, 75, 0, 0, 0, 0, 0], priority: "primary" }] }} />);
    expect(screen.queryByText(renderedText("25%"))).not.toBeInTheDocument();
  });
  it("renders full canonical evidence, zeros, exact cutoff and only awarded PR", () => {
    render(<ActivityOverviewEvidenceContent presentation={rich} />);
    for (const text of ["지속출력이 돋보인 활동", "근육 부하", "+19.3%", "242 W", "182 W", "2026-09-12 09:00 KST", "17.5% · 175 kcal"]) expect(screen.getByText(renderedText(text))).toBeInTheDocument();
    expect(screen.getAllByText("전체 기간 PR")).toHaveLength(1);
    expect(screen.getByText(renderedText(/활동 이전 90일/))).toBeInTheDocument();
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
    expect(screen.getByText(renderedText("하이라이트 · 20분 최고 출력 · 전체 기간 PR"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("고강도 반복 · 평소보다 많이"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("72.4 kJ"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("오늘 부하 지수 100 · 같은 유형 내 90일 상위 1%"))).toBeInTheDocument();
    // 역대 최고 열: 320 W 대비 90%, 이번이 최고면 100%, 서버가 비운 구간은 —.
    expect(screen.getByText(renderedText("320 W"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("90%"))).toBeInTheDocument();
    // 100% 는 무산소 최대소진 카드에도 있으므로 표 셀까지 합쳐 둘 이상이어야 한다.
    expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(renderedText(/클램프·글리치로 판정된 구간은 비워 둬요/))).toBeInTheDocument();
    expect(screen.getByText(renderedText("기준: 종목 전체 (같은 유형 표본 부족)"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("19.4 g"))).toBeInTheDocument();
    cleanup();
    // 지형 라벨은 서버가 정한 값만 보여준다.
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich, routeLoad: { climbCount: 3, highestCategory: "Cat2", terrain: "climbing" } }} />);
    expect(screen.getByText(renderedText("업힐 위주"))).toBeInTheDocument();
    cleanup();
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich, routeLoad: { climbCount: 0 } }} />);
    expect(screen.queryByText(renderedText("업힐 위주"))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText("평지 위주"))).not.toBeInTheDocument();
  });

  it("tells the best moment as a scene and shows the settled state after the activity", () => {
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich,
      peakMoment: { durationSec: 60, avgPowerW: 371, fromKm: 42.1, toKm: 42.9, avgSpeedKmh: 51.5, maxHr: 191, segmentName: "남한산성 오르막", segmentPr: true },
      postFitnessStatus: { asOf: "2026-09-13 09:00 KST", ctl: 39, atl: 62, tsb: -23, formBand: "needsRecovery" } }} />);
    expect(screen.getByText(renderedText("최고 순간 · 남한산성 오르막 (개인 최고) · 1분 371 W · 51.5 km/h · 최고심박 191"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("반영 후 CTL"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("-23"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("회복 필요"))).toBeInTheDocument();
    cleanup();
    // 세그먼트가 없으면 km 구간으로, 반영 후 값이 없으면 카드도 없다.
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich, peakMoment: { durationSec: 120, avgPowerW: 353, fromKm: 10, toKm: 11.2 } }} />);
    expect(screen.getByText(renderedText("최고 순간 · 10~11.2km 지점 · 2분 353 W"))).toBeInTheDocument();
    expect(screen.queryByText(renderedText("반영 후 CTL"))).not.toBeInTheDocument();
  });

  it("keeps the best columns blank and the baseline chip absent when records are unavailable or there is no comparison", () => {
    const value: ActivityOverviewPresentation = { ...rich, availability: { ...rich.availability!, records: "unavailable" },
      powerFingerprint: [{ duration: "2m", watts: 288, allTimeBestWatts: 320, allTimeBestPct: 90 }], zones: [{ kind: "power", seconds: [10, 20, 30, 40, 0, 0, 0], priority: "primary", currentPercentages: [10, 20, 30, 40, 0, 0, 0] }] };
    render(<ActivityOverviewEvidenceContent presentation={value} />);
    expect(screen.queryByText(renderedText("320 W"))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText("90%"))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText(/^기준:/))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText("하이라이트", false), { exact: false })).not.toBeInTheDocument();
  });

  it.each(["bike", "run", "swim"] as const)("keeps sections with missing %s inputs without inventing zero values", (discipline) => {
    render(<ActivityOverviewEvidenceContent presentation={{ coachSentence: "짧은 활동", session: { discipline } }} />);
    expect(screen.getByText(renderedText("내 기록 대비"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("회복과 에너지 모델"))).toBeInTheDocument();
    expect(screen.queryByText(renderedText("0 s"))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText("전체 기간 PR"))).not.toBeInTheDocument();
  });
  it("renders authorized power without turning window rank one or pending receipts into PRs", () => {
    render(<ActivityOverviewEvidenceContent presentation={{ ...rich, sportDetails: [], availability: { ...rich.availability!, power: "available", records: "unavailable" } }} />);
    expect(screen.getByText(renderedText("288"))).toBeInTheDocument();
    expect(screen.queryByText(renderedText("전체 기간 PR"))).not.toBeInTheDocument();
    expect(screen.getByText(renderedText(/개인기록 검증 대기/))).toBeInTheDocument();
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
    expect(screen.getByText(renderedText("이 라이더의 기록 대비"))).toBeInTheDocument();
    expect(screen.queryByText(renderedText("내 기록 대비"))).not.toBeInTheDocument();
    expect(screen.getByText(renderedText(/이 라이더의 기록 안에서의 상대 위치/))).toBeInTheDocument();
  });

  it("keeps the owner voice for the owner", () => {
    render(<ActivityOverviewEvidenceContent presentation={rich} />);
    expect(screen.getByText(renderedText("내 기록 대비"))).toBeInTheDocument();
  });
});

it("preserves estimated power and provisional FTP semantics", () => {
 render(<ActivityOverviewEvidenceContent presentation={{ ...rich, availability: { ...rich.availability!, power: "estimated" }, session: { ...rich.session, ftpVerificationRequired: true } }} />);
 expect(screen.getByText(renderedText("추정 파워 기준"))).toBeInTheDocument();
 expect(screen.getByText(renderedText("FTP 확인 필요 · 부하와 강도는 잠정 기준이에요."))).toBeInTheDocument();
 expect(screen.getByText(renderedText("NP"))).toBeInTheDocument();
});

it.each(["complete", "incomplete", "unknown"] as const)("preserves per-zone comparison completeness (%s) independently of session FTP", (historyCompleteness) => {
 render(<ActivityOverviewEvidenceContent presentation={{ ...rich, session: { ...rich.session, ftpVerificationRequired: false }, comparisonMetadata: undefined,
  zones: [{ kind: "power", seconds: [100, 0, 0, 0, 0, 0, 100], priority: "primary", historyCompleteness, provisional: historyCompleteness !== "complete" }] }} />);
 const labels = { complete: "전체 비교 기록 확인", incomplete: "일부 비교 기록 기준", unknown: "비교 기록 완전성 미확인" };
 expect(screen.getByText(labels[historyCompleteness])).toBeInTheDocument();
 expect(screen.queryByText(renderedText("존 비교 잠정 · FTP 확인이 필요한 과거 기록 포함")) != null).toBe(historyCompleteness !== "complete");
 expect(screen.queryByText(renderedText("FTP 확인 필요 · 부하와 강도는 잠정 기준이에요."))).not.toBeInTheDocument();
});
it("distinguishes previous best from all-time best including this activity", () => {
 render(<ActivityOverviewEvidenceContent presentation={{ ...rich, observedEffects: ["관찰된 스프린트"], powerFingerprint: [{ duration: "5s", watts: 330, allTimeBestWatts: 330, allTimeBestPct: 100, previousBestPct: 110 }] }} />);
 expect(screen.getByText(renderedText("관찰된 스프린트"))).toBeInTheDocument();
 expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
 expect(screen.getByText(renderedText("110%"))).toBeInTheDocument();
 expect(screen.getByText(renderedText(/역대 최고 대비는 이번 활동을 포함한/))).toBeInTheDocument();
 expect(screen.getByText(renderedText(/활동 전 최고 대비는 이번 활동 이전/))).toBeInTheDocument();
});

it("supplements the rich summary without repeating narrative, load or fitness cards and retains unique model inputs", () => {
  const { container } = render(<ActivityOverviewEvidenceContent presentation={{ ...rich, thresholdWork: { ...rich.thresholdWork, aboveFtpKj: 18.9 }, routeLoad: { highestCategory: "HC", avgGradePct: 4.2 } }} supplemental />);
  expect(screen.queryByText(rich.coachSentence!)).not.toBeInTheDocument();
  expect(screen.queryByText("NP")).not.toBeInTheDocument();
  expect(screen.getByText(renderedText("18.9 kJ"))).toBeInTheDocument();
  expect(screen.getByText(renderedText("19.4 g"))).toBeInTheDocument();
  expect(screen.getByText(renderedText("1000 kcal"))).toBeInTheDocument();
  expect(screen.getByText("HC")).toBeInTheDocument();
  expect(screen.getByText("4.2%")).toBeInTheDocument();
  expect(container.querySelectorAll('section[aria-label="훈련 부하 변화"]')).toHaveLength(0);
  expect(Array.from(container.querySelectorAll("section > .grid .ds-card")).every(card => !card.textContent?.includes("—"))).toBe(true);
});

it("retains non-bike fuel and orphan effort time when the rich summary does not visualize them", () => {
  const { rerender } = render(<ActivityOverviewEvidenceContent presentation={{ session: { discipline: "run" }, energy: { fatPct: 25, carbPct: 75, fatKcal: 100, carbKcal: 300 } }} supplemental />);
  expect(screen.getByText(renderedText("25% · 100 kcal"))).toBeInTheDocument();
  rerender(<ActivityOverviewEvidenceContent presentation={{ session: { discipline: "bike" }, thresholdWork: { matchesTotalSec: 42 }, energy: { fatKcal: 175 } }} supplemental />);
  expect(screen.getByText(renderedText("42 s"))).toBeInTheDocument();
  expect(screen.getByText(renderedText("— · 175 kcal"))).toBeInTheDocument();
});

it("renders supplemental scalar evidence as compact facts while keeping comparison tables", () => {
  const { container } = render(<ActivityOverviewEvidenceContent presentation={{ ...rich, thresholdWork: { aboveFtpKj: 18.9 } }} supplemental />);
  const fact = screen.getByText(renderedText("18.9 kJ")).closest(".activity-evidence-fact")!;
  expect(fact.closest("dl")).toBeInTheDocument();
  expect(fact.closest(".ds-card")).toBeNull();
  expect(container.querySelectorAll(".activity-evidence-fact dt").length).toBeGreaterThan(1);
  expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
});

it("keeps compact two-column comparisons labelled with duration and comparison context", () => {
  const { container } = render(<ActivityOverviewEvidenceContent supplemental presentation={{ session: { discipline: "bike" }, powerFingerprint: [
    { duration: "2m", watts: 288, deltaPct: 19.3 }, { duration: "5m", watts: 219, deltaPct: -4 },
  ] }} />);
  const comparison = container.querySelector(".activity-evidence-comparison")!;
  expect(comparison).toHaveAccessibleName(/변화/);
  expect(comparison.querySelector("dt")).toHaveTextContent("2m");
  expect(comparison.querySelector("dd")).toHaveTextContent("+19.3%");
});
