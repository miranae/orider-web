import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import enGlossary from "../../../i18n/resources/en/termGlossary.json";
import enActivity from "../../../i18n/resources/en/activity.json";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import { OriderThemeProvider } from "../../../theme";
import ActivityOverviewSummary, { ActivityOverviewSummaryContent } from "./ActivityOverviewSummary";

// 파워 커브는 Chart.js 캔버스다 — jsdom 에서는 받은 데이터만 본다.
const { line } = vi.hoisted(() => ({ line: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Line: (props: { "aria-label"?: string }) => { line(props); return <div data-testid="power-curve" role="img" aria-label={props["aria-label"]} />; } }));
const Themed = ({ children }: { children: ReactNode }) => <ThemeProvider><OriderThemeProvider>{children}</OriderThemeProvider></ThemeProvider>;
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Themed });

// Tooltip triggers split visible sentences across descendants; assert the same full text.
function renderedText(expected: string | RegExp, exact = true) {
  const matches = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    return typeof expected === "string" ? exact ? normalized === expected : normalized.toLowerCase().includes(expected.toLowerCase()) : expected.test(normalized);
  };
  return (content: string, node: Element | null) => matches(content) || !!node && matches(node.textContent ?? "") && !Array.from(node.children).some(child => matches(child.textContent ?? ""));
}

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
  it.each(["tss", "time"] as const)("names the accepted load and preserves its %s basis without recalculation", (source) => {
    render(<ActivityOverviewSummaryContent presentation={{ ...rich, session: { ...rich.session, load: 220, loadKind: source === "tss" ? "tss" : "load", loadSource: source } }} />);
    expect(screen.getByText(renderedText("반영 훈련 부하"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("220"))).toBeInTheDocument();
    expect(screen.getByText(renderedText(source === "tss" ? /TSS 기준/ : /시간 기반 추정/))).toBeInTheDocument();
  });

  it.each(["ko"])("explains repeated known labels without nesting interactive controls in %s", async language => {
    i18n.addResourceBundle("en", "activity", enActivity, true, true);
    i18n.addResourceBundle("en", "termGlossary", enGlossary, true, true);
    await i18n.changeLanguage(language);
    const { container } = render(<ActivityOverviewSummaryContent presentation={{ ...rich, session: { ...rich.session, loadKind: "tss", intensityFactor: 0.85 } }} />);
    for (const id of ["tss", "np", "if", "z4", "ctl", "atl", "tsb"]) expect(container.querySelector(`[data-glossary-term="${id}"] button`)).toBeInTheDocument();
    const repeated = container.querySelectorAll('[data-glossary-term="z4"] button');
    expect(repeated.length).toBeGreaterThan(1);
    fireEvent.click(container.querySelector('[data-glossary-term="np"] button')!);
    expect(screen.getByRole("tooltip")).toHaveTextContent(language === "en" ? "Normalized power" : "정규화 파워");
    expect(container.querySelector('button button, a button')).toBeNull();
  });

  it("keeps bike fuel and W-prime language out of a run, and shows recovery only when modeled", () => {
    const run = { ...rich, session: { ...rich.session, discipline: "run" as const } };
    const { rerender } = render(<ActivityOverviewSummaryContent presentation={run} />);
    expect(screen.getByRole("region", { name: "회복" })).toBeInTheDocument();
    expect(screen.getByText(renderedText(/회복시간은 계측 부하/))).toBeInTheDocument();
    expect(screen.queryByText(renderedText(/W′/))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText("회복과 연료"))).not.toBeInTheDocument();
    rerender(<ActivityOverviewSummaryContent presentation={{ ...run, recovery: undefined }} />);
    expect(screen.queryByRole("region", { name: "회복" })).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText(/회복시간은 계측 부하/))).not.toBeInTheDocument();
  });
  it("renders the share-summary sections without analysis tables or basic activity stats", () => {
    render(<ActivityOverviewSummaryContent presentation={rich} />);
    for (const title of ["훈련 자극", "나의 변화", "회복과 연료", "시작 전 상태"]) expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(rich.coachSentence)).toBeInTheDocument();
    expect(screen.getByText(renderedText("25%"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("0회 · 0초"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("1분"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("피크 파워 변화 · 2분"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("+19.3% · 10회"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("전체 기간 PR"))).toBeInTheDocument();
    expect(screen.queryByText(renderedText(/분석 기준 FTP 182 W/))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText("근육 부하"))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText("1520"))).not.toBeInTheDocument();
    expect(screen.getByText(renderedText(/직접 측정한 생리값/))).toBeInTheDocument();
  });

  it("shows the user-approved-value caveat as a separate caption only when qualityNote is true", () => {
    const { rerender } = render(<ActivityOverviewSummaryContent presentation={rich} />);
    const modelNote = screen.getByText(renderedText("회복·연료·W′ 값은 계측값을 바탕으로 한 모델 추정이며 직접 측정한 생리값이 아니에요."));
    const qualityNote = screen.getByText(renderedText("※ 사용자 승인값이 없으면 계측값을 사용해요."));
    expect(modelNote).not.toBe(qualityNote);
    expect(modelNote).toHaveClass("ds-text--caption");
    expect(qualityNote).toHaveClass("ds-text--caption");
    rerender(<ActivityOverviewSummaryContent presentation={{ ...rich, qualityNote: false }} />);
    expect(screen.queryByText(renderedText("※ 사용자 승인값이 없으면 계측값을 사용해요."))).not.toBeInTheDocument();
    expect(screen.getByText(renderedText(modelNote.textContent!))).toBeInTheDocument();
  });


  it("shows every verified PR and only the strongest personal comparisons", () => {
    render(<ActivityOverviewSummaryContent presentation={{ ...rich, powerFingerprint: [
      ...rich.powerFingerprint!,
      { duration: "10m", watts: 204, deltaPct: 8, medianWatts: 180, priorSampleCount: 10, recordAchievement: "new" },
      { duration: "20m", watts: 190, deltaPct: 6, medianWatts: 170, priorSampleCount: 10, recordAchievement: "new" },
    ] }} />);
    expect(screen.getByText(renderedText("5분 · 219 W"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("10분 · 204 W"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("20분 · 190 W"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("+19.3% · 10회"))).toBeInTheDocument();
    expect(screen.queryByText(renderedText("+8% · 10회"))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText(/Z1 \+15/))).not.toBeInTheDocument();
  });
  it.each(["bike", "run"] as const)("keeps the same frame for missing %s inputs", (discipline) => {
    render(<ActivityOverviewSummaryContent presentation={{ session: { discipline }, thresholdWork: {}, availability: { personal: "character_uncertain", records: "unavailable", power: "unavailable", heartRate: "unavailable" } }} />);
    expect(screen.getAllByRole("region")).toHaveLength(discipline === "bike" ? 4 : 3);
    // 회복 모델이 없는 러닝·수영에는 회복/연료 영역을 만들지 않는다.
    expect(screen.queryByText(renderedText(/자극 분석 정보/))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText("짧은 활동"))).not.toBeInTheDocument();
    expect(screen.getByText(renderedText(/성격이 불명확/))).toBeInTheDocument();
    expect(screen.queryByText(renderedText("전체 기간 PR"))).not.toBeInTheDocument();
  });
  it("renders authorized power without promoting window rank to PR", () => {
    render(<ActivityOverviewSummaryContent presentation={{ ...rich, availability: { ...rich.availability!, records: "unavailable" } }} />);
    expect(screen.queryByText(renderedText("전체 기간 PR"))).not.toBeInTheDocument();
    expect(screen.getByText(renderedText("피크 파워 변화 · 2분"))).toBeInTheDocument();
  });
  it("does not highlight comparisons from incomplete history", () => {
    render(<ActivityOverviewSummaryContent presentation={{ ...rich, comparisonMetadata: { ...rich.comparisonMetadata!, historyCompleteness: "incomplete" } }} />);
    expect(screen.queryByText(renderedText("+19.3% · 10회"))).not.toBeInTheDocument();
    expect(screen.queryByText(renderedText(/Z1 \+15/))).not.toBeInTheDocument();
    expect(screen.getByText(renderedText("전체 기간 PR"))).toBeInTheDocument();
  });
  it("keeps the owner history slot across summary states and suppresses it when the card is disabled or unavailable to a viewer", () => {
    const overview = { enabled: false, loading: false, response: null, error: false, retry: vi.fn() };
    const child = <section aria-label="Owner history">History</section>;
    const { rerender } = render(<ActivityOverviewSummary overview={overview}>{child}</ActivityOverviewSummary>);
    expect(screen.queryByRole("region", { name: "Owner history" })).not.toBeInTheDocument();
    for (const state of [{ loading: true }, { error: true }, { response: { status: "unavailable" as const, activityId: "a", reason: "rollout_disabled" as const } }]) {
      rerender(<ActivityOverviewSummary overview={{ ...overview, enabled: true, ...state }}>{child}</ActivityOverviewSummary>);
      expect(screen.getByRole("region", { name: "Owner history" })).toBeInTheDocument();
      rerender(<ActivityOverviewSummary overview={{ ...overview, enabled: true, ...state }} isOwner={false}>{child}</ActivityOverviewSummary>);
      expect(screen.queryByRole("region", { name: "Owner history" })).not.toBeInTheDocument();
    }
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

describe("activity overview summary shows what the server actually sent", () => {
  // 이력이 얕은 라이더의 실제 운영 응답 모양 — 비교·존·개인지수가 전부 비어 있다.
  const sparse: ActivityOverviewPresentation = {
    coachSentence: "오늘의 라이딩이었어요.",
    availability: { personal: "character_uncertain", records: "evaluated", power: "available", heartRate: "unavailable" },
    session: { discipline: "bike", load: 50, loadKind: "load", normalizedPowerW: 167.1, intensityFactor: 0.72 },
    zones: [],
    powerFingerprint: [
      { duration: "1s", watts: 781 }, { duration: "5s", watts: 646 },
      { duration: "1m", watts: 290 }, { duration: "20m", watts: 152 },
    ],
    routeLoad: { climbCount: 2, avgGradePct: 0.8, maxGradePct: 11.4 },
    thresholdWork: { wPrimeDepletionPct: 100 },
    priorFitnessStatus: { asOf: "2026-09-16 09:00 KST", ctl: 53.9, atl: 56.5, tsb: -2.6, formBand: "productive" },
    recovery: { hours: 11, load: 50 },
  };

  it("renders the peak power curve even with no comparison history", () => {
    render(<ActivityOverviewSummaryContent presentation={sparse} />);
    for (const watts of ["781", "646", "290", "152"]) expect(screen.getByText(watts)).toBeInTheDocument();
  });

  it("renders session load, NP and IF — they appear nowhere else on the page", () => {
    render(<ActivityOverviewSummaryContent presentation={sparse} />);
    expect(screen.getByText(renderedText("50"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("167.1"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("0.72"))).toBeInTheDocument();
  });

  it("renders authorized power sections for another viewer", () => {
    render(<ActivityOverviewSummaryContent presentation={sparse} isOwner={false} />);
    expect(screen.getByText(renderedText("781"))).toBeInTheDocument();
    expect(screen.getByText(renderedText("167.1"))).toBeInTheDocument();
  });
});

it("preserves estimated power and provisional FTP semantics", () => {
 render(<MemoryRouter><ActivityOverviewSummaryContent presentation={{ ...rich, availability: { ...rich.availability!, power: "estimated" }, session: { ...rich.session, ftpVerificationRequired: true } }} /></MemoryRouter>);
 expect(screen.getByText(renderedText("추정 파워 기준"))).toBeInTheDocument();
 expect(screen.getByText(renderedText("FTP 확인 필요 · 부하와 강도는 잠정 기준이에요."))).toBeInTheDocument();
 expect(screen.getByText(renderedText("NP"))).toBeInTheDocument();
});

it("preserves observed effects, historical zone uncertainty and previous-best percentages", () => {
 render(<MemoryRouter><ActivityOverviewSummaryContent presentation={{ ...rich, observedEffects: ["관찰된 스프린트"], session: { ...rich.session, ftpVerificationRequired: false }, zones: [{ kind: "power", seconds: [10, 0, 0, 5], priority: "primary", historyCompleteness: "incomplete", provisional: true }], powerFingerprint: [{ duration: "5s", watts: 330, previousBestPct: 110 }] }} /></MemoryRouter>);
 expect(screen.getByText(renderedText("관찰된 스프린트"))).toBeInTheDocument();
 expect(screen.getByText(renderedText("존 비교 잠정 · FTP 확인이 필요한 과거 기록 포함"))).toBeInTheDocument();
 expect(screen.getByText(renderedText(/일부 비교 기록 기준/))).toBeInTheDocument();
 // 역대 최고가 없으면 비교선 없이 활동 전 최고 대비 % 만 남는다(툴팁·보조 목록이 같은 기준).
 expect(screen.getByText(renderedText(/활동 전 최고 대비 110%/))).toBeInTheDocument();
 // 비교 기준 설명은 그림 옆 ⓘ 로 접혀 있다.
 expect(screen.queryByText(renderedText(/활동 전 최고 대비는 이번 활동 이전/))).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "구간 최고 출력 설명" }));
 expect(screen.getByRole("tooltip")).toHaveTextContent(/활동 전 최고 대비는 이번 활동 이전/);
 expect(screen.queryByText(renderedText("FTP 확인 필요 · 부하와 강도는 잠정 기준이에요."))).not.toBeInTheDocument();
});

it.each(["ko"])("shows integrated before/after estimates without readiness or numeric recovery (%s)", async language => {
  i18n.addResourceBundle("en", "activity", enActivity, true, true);
  await i18n.changeLanguage(language);
  const { container } = render(<ActivityOverviewSummaryContent presentation={{ ...rich, fitnessScope: "integrated", fitnessEvidence: "limited",
    recoveryGuidance: "sport_specific", recovery: undefined,
    postFitnessStatus: { asOf: "2026-09-12 14:00 KST", ctl: 38, atl: 49, tsb: -11, formBand: "needsRecovery", basis: "activity" },
    sportFitnessStatus: { discipline: "run", ctl: .5, atl: .3, tsb: .2, evidence: "limited" } }} />);
  expect(container.textContent).toContain(language === "en" ? "Combined training load" : "통합 훈련 부하");
  expect(container.textContent).toContain(language === "en" ? "assessment withheld" : "상태 판단 보류");
  expect(container.textContent).toContain("2026-09-12 14:00 KST");
  expect(container.textContent).not.toContain(language === "en" ? "Productive" : "순항");
  expect(container.textContent).not.toMatch(/Recommended recovery|권장 회복/);
});

describe("activity overview reads as pictures", () => {
  it("draws intensity, zone time, the power curve and the load shift from the server values only", () => {
    line.mockClear();
    const presentation: ActivityOverviewPresentation = { ...rich, session: { ...rich.session, loadKind: "tss", intensityFactor: 0.83 },
      fitnessScope: "integrated", fitnessEvidence: "sufficient",
      zones: [{ kind: "power", seconds: [570, 632, 557, 370, 134, 84, 58], priority: "primary", currentPercentages: [23.7, 26.3, 23.2, 15.4, 5.6, 3.5, 2.4] }],
      postFitnessStatus: { asOf: "2026-09-12 14:00 KST", ctl: 52.8, atl: 65.1, tsb: -12.3, formBand: "needsRecovery", basis: "activity" },
      powerFingerprint: [
        { duration: "1s", watts: 845, allTimeBestWatts: 845, allTimeBestPct: 100, previousBestPct: 102.3, recordAchievement: "new" },
        { duration: "5m", watts: 177, allTimeBestWatts: 298, allTimeBestPct: 59.4, previousBestPct: 59.4 },
      ] };
    render(<ActivityOverviewSummaryContent presentation={presentation} />);
    expect(screen.getByRole("img", { name: "강도 게이지 · IF 0.83 (FTP 1.00 기준)" })).toBeInTheDocument();
    // 존 막대는 서버 비중을 그대로 읽어 준다 — 초에서 다시 나누지 않는다.
    expect(screen.getByRole("group", { name: /^존별 시간 비중: Z1 23.7%, Z2 26.3%, .*Z7 2.4%$/ })).toBeInTheDocument();
    expect(screen.getByText(renderedText("26.9%"))).toBeInTheDocument();
    const curve = line.mock.lastCall![0] as { data: { datasets: Array<{ label: string; data: Array<number | null> }> } };
    expect(curve.data.datasets.map((dataset) => dataset.label)).toEqual(["이번 활동", "역대 최고"]);
    // 로그 시간축 — 각 점이 (창 길이 초, W) 좌표다.
    expect(curve.data.datasets[0]!.data).toEqual([{ x: 1, y: 845 }, { x: 300, y: 177 }]);
    expect(curve.data.datasets[1]!.data).toEqual([{ x: 1, y: 845 }, { x: 300, y: 298 }]);
    // 선이 역대 최고면 툴팁·보조 목록의 % 도 역대 최고 대비다 — 한 기준.
    expect(screen.getByText(renderedText("1초 845 W · 역대 최고 845 W · 역대 최고 대비 100% · 전체 기간 PR"))).toBeInTheDocument();
    // 통합 부하는 이름에 범위를 밝힌다 — 종목별 각주의 CTL 과 구분된다.
    expect(screen.getByRole("img", { name: "통합 체력 · CTL 37.4 → 52.8" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "통합 폼 · TSB -4.6 → -12.3" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /지방 18% · 탄수화물 82%/ })).toBeInTheDocument();
    // 개요는 숫자 근거 표가 아니다 — 표는 분석 탭의 평가 근거가 맡는다.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("falls back to heart-rate zones without power pictures for a run", () => {
    line.mockClear();
    render(<ActivityOverviewSummaryContent presentation={{ session: { discipline: "run", load: 34, loadKind: "load", loadSource: "time" },
      zones: [{ kind: "heartRate", seconds: [1314, 401, 270, 67, 3], priority: "secondary", currentPercentages: [63.9, 19.5, 13.2, 3.3, 0.1] }],
      powerFingerprint: [{ duration: "1s", watts: 500 }], priorFitnessStatus: rich.priorFitnessStatus,
      availability: { personal: "unavailable", records: "evaluated", power: "not_applicable", heartRate: "available" } }} />);
    expect(screen.getByRole("group", { name: /^존별 시간 비중: Z1 63.9%/ })).toBeInTheDocument();
    expect(screen.getByText(renderedText("심박 · 존별 시간"))).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /강도 게이지/ })).not.toBeInTheDocument();
    expect(line).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "구간 최고 출력" })).not.toBeInTheDocument();
    // 운동 후가 없으면 점 그림 대신 운동 전 숫자 셋 — 제목도 "시작 전 상태".
    expect(screen.getByRole("region", { name: "시작 전 상태" })).toBeInTheDocument();
    for (const value of ["37.4", "42.0", "-4.6"]) expect(screen.getByText(renderedText(value))).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /체력 · CTL/ })).not.toBeInTheDocument();
  });
});

describe("overview picture geometry and data guards", () => {
  it("lays the IF bands on the same 0–100% axis as the ticks, FTP line and marker", async () => {
    const { IF_TICKS, ifBandLayout, ifPos } = await import("./ActivityOverviewCharts");
    const bands = ifBandLayout();
    expect(bands[0]!.left).toBe(0);
    IF_TICKS.forEach((tick, index) => {
      expect(bands[index]!.left + bands[index]!.width).toBeCloseTo(ifPos(tick), 10);
      expect(bands[index + 1]!.left).toBeCloseTo(ifPos(tick), 10);
    });
    const last = bands[bands.length - 1]!;
    expect(last.left + last.width).toBeCloseTo(100, 10);
    // FTP(1.00)는 0.90–1.05 띠 안에 있다 — 예전 flex 배치에서는 빨강 띠에 놓였다.
    const ftp = ifPos(1);
    expect(ftp).toBeGreaterThan(bands[3]!.left);
    expect(ftp).toBeLessThan(bands[3]!.left + bands[3]!.width);
  });

  it("drops a non-monotonic all-time-best line but keeps the previous-best percentage", async () => {
    const { isNonIncreasing, powerComparisonBasis } = await import("./ActivityOverviewCharts");
    expect(isNonIncreasing([945, 900, null, 500])).toBe(true);
    expect(isNonIncreasing([845, 945, 760])).toBe(false);
    const rows = [
      { duration: "1s", watts: 845, allTimeBestWatts: 845, allTimeBestPct: 100, previousBestPct: 102.3 },
      { duration: "5s", watts: 650, allTimeBestWatts: 945, allTimeBestPct: 68.8, previousBestPct: 68.8 },
    ];
    expect(powerComparisonBasis(rows, true, false)).toBe("previousBest");
    line.mockClear();
    render(<ActivityOverviewSummaryContent presentation={{ ...rich, powerFingerprint: rows }} />);
    const curve = line.mock.lastCall![0] as { data: { datasets: Array<{ label: string }> } };
    expect(curve.data.datasets.map((dataset) => dataset.label)).toEqual(["이번 활동"]);
    expect(screen.getByText(renderedText(/5초 650 W · 활동 전 최고 대비 68.8%/))).toBeInTheDocument();
    expect(screen.queryByText(renderedText(/역대 최고 945/))).not.toBeInTheDocument();
  });

  it("draws the FTP reference only from the server FTP and folds an empty comparison into one line", () => {
    line.mockClear();
    render(<ActivityOverviewSummaryContent presentation={{ ...rich, personal: [], comparisonMetadata: undefined }} ftpW={182} />);
    const curve = line.mock.lastCall![0] as { data: { datasets: Array<{ label: string; data: number[] }> } };
    expect(curve.data.datasets.at(-1)).toMatchObject({ label: "FTP 182 W", data: [{ x: 120, y: 182 }, { x: 300, y: 182 }] });
    const changes = screen.getByRole("region", { name: "나의 변화" });
    expect(changes.querySelector("h3")).toHaveTextContent("나의 변화");
    expect(changes).toHaveTextContent(/나의 변화.+/);
  });

  it("names what the quality warning is about and drops model notes without model values", () => {
    render(<ActivityOverviewSummaryContent presentation={{ session: { discipline: "bike", load: 112, loadKind: "load" },
      routeLoad: { climbCount: 1, elevationSuspect: true }, recovery: { hours: 26, load: 112 },
      availability: { personal: "insufficient_history", records: "evaluated", power: "unavailable", heartRate: "available" } }} />);
    expect(screen.getByText(renderedText("고도 데이터 품질 주의 · 오르막 수는 참고값"))).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "회복" })).toBeInTheDocument();
    // 회복시간은 모델 값이므로 각주가 남는다. W′·연료가 없어도 회복이 있으면 그것을 말한다.
    // 회복만 있으면 각주도 회복만 말한다.
    expect(screen.getByText(renderedText("회복 값은 계측값을 바탕으로 한 모델 추정이며 직접 측정한 생리값이 아니에요."))).toBeInTheDocument();
  });

  it("omits the model footnote when no modeled value is on screen", () => {
    render(<ActivityOverviewSummaryContent presentation={{ session: { discipline: "bike" },
      availability: { personal: "unavailable", records: "unavailable", power: "unavailable", heartRate: "unavailable" } }} />);
    expect(screen.queryByText(renderedText(/계측값을 바탕으로 한 모델/))).not.toBeInTheDocument();
  });
});

describe("overview duration wording", () => {
  it("drops zero units: seconds under a minute, minutes, and hours with minutes", async () => {
    const { formatSpan } = await import("./ActivityOverviewCharts");
    const ko = { hour: "시간", minute: "분", second: "초" };
    expect(formatSpan(30, ko)).toBe("30초");
    expect(formatSpan(60, ko)).toBe("1분");
    expect(formatSpan(90, ko)).toBe("1분 30초");
    expect(formatSpan(3600, ko)).toBe("1시간");
    expect(formatSpan(3900, ko)).toBe("1시간 5분");
    expect(formatSpan(0, ko)).toBe("0초");
    expect(formatSpan(3600, { hour: "h", minute: "m", second: "s" })).toBe("1h");
  });
});

describe("overview v9 zone strip, legend and change meters", () => {
  const zone = { kind: "heartRate" as const, seconds: [2563, 2776, 491, 73, 0], priority: "secondary" as const, currentPercentages: [43.4, 47, 8.3, 1.2, 0] };
  it("reads each zone segment with one tab stop and arrow keys, showing a tooltip with name, time and share", () => {
    render(<ActivityOverviewSummaryContent presentation={{ session: { discipline: "bike", load: 112 }, zones: [zone] }} />);
    const segments = screen.getAllByRole("img", { name: /^Z\d/ }).filter((node) => node.hasAttribute("tabindex"));
    expect(segments.map((node) => node.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    fireEvent.focus(segments[0]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Z1 회복42:43 · 43.4%");
    fireEvent.keyDown(segments[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(segments[1]);
    expect(segments[1]!.getAttribute("tabindex")).toBe("0");
  });


  it("draws peak power change on a fixed ±50% scale and marks values beyond it", async () => {
    const { deltaBarLayout, DELTA_RANGE } = await import("./ActivityOverviewCharts");
    expect(DELTA_RANGE).toBe(50);
    expect(deltaBarLayout(25)).toEqual({ half: 25, clipped: false });
    expect(deltaBarLayout(-5.3)).toEqual({ half: 5.3, clipped: false });
    expect(deltaBarLayout(80)).toEqual({ half: 50, clipped: true });
    const { container } = render(<ActivityOverviewSummaryContent presentation={{ ...rich, powerFingerprint: [{ duration: "2m", watts: 400, deltaPct: 72, medianWatts: 232, priorSampleCount: 10 }] }} />);
    expect(container.querySelector(".activity-overview-delta__bar.is-clipped")).not.toBeNull();
    expect(container.querySelector(".activity-overview-delta__scale")).toHaveTextContent("−50%0+50%");
  });
});

describe("overview v10 touch tooltip", () => {
  const zone = { kind: "heartRate" as const, seconds: [2563, 2776, 491, 73, 0], priority: "secondary" as const, currentPercentages: [43.4, 47, 8.3, 1.2, 0] };
  it("closes the segment tooltip when the same segment is tapped again or when tapping elsewhere", () => {
    render(<ActivityOverviewSummaryContent presentation={{ session: { discipline: "bike", load: 112 }, zones: [zone] }} />);
    const [first] = screen.getAllByRole("img", { name: /^Z1/ }).filter((node) => node.hasAttribute("tabindex"));
    fireEvent.click(first!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Z1 회복");
    fireEvent.click(first!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(first!);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

});

it("closes the zone tooltip with Escape while keeping focus on the segment", () => {
  render(<ActivityOverviewSummaryContent presentation={{ session: { discipline: "bike", load: 112 }, zones: [{ kind: "heartRate", seconds: [600, 300, 0, 0, 0], priority: "secondary", currentPercentages: [66.7, 33.3, 0, 0, 0] }] }} />);
  const [first] = screen.getAllByRole("img", { name: /^Z1/ }).filter((node) => node.hasAttribute("tabindex"));
  fireEvent.focus(first!);
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
  fireEvent.keyDown(first!, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
