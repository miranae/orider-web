import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import koActivity from "../i18n/resources/ko/activity.json";
import koGlossary from "../i18n/resources/ko/metricGlossary.json";
import enGlossary from "../i18n/resources/en/metricGlossary.json";
import enActivity from "../i18n/resources/en/activity.json";
import type { ActivityStreams } from "@shared/types";
import type { UseActivityMetricsState } from "../hooks/useActivityMetrics";

const state = vi.hoisted(() => ({ metrics: {} as UseActivityMetricsState, units: "metric" as "metric" | "imperial", language: null as "ko" | "en" | null }));
vi.mock("../hooks/useActivityMetrics", () => ({ useActivityMetrics: () => state.metrics }));
vi.mock("react-i18next", () => ({ useTranslation: (namespace = "activity") => ({ t: (key: string, values?: Record<string, unknown>) => {
  if (!state.language) return key;
  const resource: unknown = namespace === "metricGlossary" ? (state.language === "ko" ? koGlossary : enGlossary) : state.language === "ko" ? koActivity : enActivity;
  const value = key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, resource);
  return typeof value === "string" ? value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")) : key;
} }) }));
vi.mock("./ZoneDistributionChart", () => ({ default: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("../contexts/LocaleContext", () => ({ useLocale: () => ({ locale: "ko", units: state.units }) }));

afterEach(() => { cleanup(); state.units = "metric"; state.language = null; });

/** 파워·심박이 전혀 없는 GPS 전용 러닝의 서버 정본. 가장 흔한 러너 구성이다. */
function gpsOnlyRunMetrics(): UseActivityMetricsState {
  return {
    status: "ready",
    metrics: {
      discipline: "run", distanceKm: 16.02, durationSec: 5445, movingTimeSec: 3900,
      avgPower: null, np: null, avgHr: null, maxHr: null,
      powerZoneSec: [], hrZoneSec: [], mmp: {},
      splits: [
        { km: 1, paceSec: 243, gapSec: 238, elevGain: 4, elevLoss: 3, avgHr: null, avgCadence: null },
        { km: 2, paceSec: 247, gapSec: 240, elevGain: 5, elevLoss: 4, avgHr: null, avgCadence: null },
      ],
      runMetrics: { gapAvgSec: 239, minPaceSecPerKm: 205, paceStdDevSec: 12 },
    },
  } as unknown as UseActivityMetricsState;
}

function renderRun() {
  return render(
    <AnalysisTab
      activityId="strava_1" sport="run" isOwner
      streams={{ time: [], distance: [] } as unknown as ActivityStreams}
      summary={{ distance: 16020 } as never}
    />,
  );
}

import AnalysisTab from "./AnalysisTab";

describe("러닝 분석 게이트", () => {
  it.each(["ko", "en"] as const)("서버 근거로만 쉬운 요약을 보여주고 고급 지표를 접어 둔다 locale=%s", language => {
    state.language = language;
    state.metrics = gpsOnlyRunMetrics();
    Object.assign(state.metrics.metrics!, { avgSpeedKph: 12, avgHr: 150, avgPower: 264, trimp: 90 });
    renderRun();
    const recap = screen.getByTestId("run-recap");
    expect(recap).toHaveTextContent(language === "ko" ? "16.0km를 평균 5:00/km로 달렸어요." : "You covered 16.0km at an average pace of 5:00/km.");
    expect(recap).not.toHaveTextContent(/PR|FTP|개인 최고|개선|회복|injury|recovery|improved|\{\{/);
    expect(screen.getByTestId("run-recap").nextElementSibling).toBe(screen.getByTestId("run-split-profile"));
    const details = screen.getByTestId("run-detail-disclosure");
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText(language === "ko" ? "러닝 파워" : "Running power")).not.toBeVisible();
    details.setAttribute("open", "");
    expect(within(details).getByText("264 W")).toBeVisible();
    expect(screen.getByTestId("run-raw-splits")).not.toHaveAttribute("open");
  });

  it("21개 스플릿은 세로 탐색하며 마지막 구간의 결과도 목록 위에서 즉시 확인한다", () => {
    state.language = "ko";
    state.metrics = gpsOnlyRunMetrics();
    Object.assign(state.metrics.metrics!, { distanceKm: 21.02, splits: Array.from({ length: 21 }, (_, index) => ({ km: index + 1, paceSec: 350 - index, gapSec: 345 - index, avgHr: 140 + index, avgCadence: 95, elevGain: 1, elevLoss: 1 })), cadenceUnit: "strides_per_minute" });
    renderRun();
    const group = screen.getByRole("group", { name: "km별 페이스 탐색" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(21);
    expect(group).toHaveStyle({ overflowY: "auto", overflowX: "hidden", maxHeight: "calc(var(--space-8) * 6)" });
    expect(buttons[0]).toHaveStyle({ minHeight: "44px" });
    buttons[0]!.focus();
    fireEvent.keyDown(buttons[0]!, { key: "End" });
    expect(buttons[20]).toHaveFocus();
    expect(buttons[20]).toHaveAttribute("aria-pressed", "true");
    const selected = screen.getByTestId("selected-run-split");
    expect(selected).toHaveTextContent("21km 구간 기록");
    expect(selected).toHaveTextContent("5:30/km");
    expect(selected).toHaveTextContent("160 bpm");
    expect(selected).toHaveTextContent("190 spm");
    expect(selected.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.keyDown(buttons[20]!, { key: "ArrowUp" });
    expect(buttons[19]).toHaveFocus();
    fireEvent.keyDown(buttons[19]!, { key: "Home" });
    expect(buttons[0]).toHaveFocus();
    fireEvent.click(buttons[5]!);
    expect(selected).toHaveTextContent("6km 구간 기록");
  });

  it("단일·같은 페이스 막대는 차이를 만들어내지 않고 부분 구간은 가장 빠른 1km로 부르지 않는다", () => {
    state.language = "ko";
    state.metrics = gpsOnlyRunMetrics();
    Object.assign(state.metrics.metrics!, { distanceKm: 1.5, splits: [{ km: 1, paceSec: 300, avgHr: null }, { km: 2, paceSec: 200, avgHr: null }] });
    renderRun();
    expect(screen.getByTestId("split-bar-1")).toHaveStyle({ width: "25%" });
    expect(screen.getByTestId("split-bar-2")).toHaveStyle({ width: "100%" });
    const group = screen.getByRole("group", { name: "km별 페이스 탐색" });
    const rows = within(group).getAllByRole("button");
    expect(rows[1]).toHaveTextContent("부분 구간");
    expect(rows[1]).not.toHaveTextContent("가장 빠름");
    cleanup();
    Object.assign(state.metrics.metrics!, { distanceKm: 2, splits: [{ km: 1, paceSec: 300 }, { km: 2, paceSec: 300 }] });
    renderRun();
    expect(screen.getByTestId("split-bar-1")).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("split-bar-2")).toHaveStyle({ width: "100%" });
    cleanup();
    Object.assign(state.metrics.metrics!, { distanceKm: null, distanceSource: null, splits: [{ km: 1, paceSec: 300 }] });
    renderRun();
    expect(screen.getByTestId("split-bar-1")).toHaveStyle({ width: "100%" });
    expect(screen.getByRole("group", { name: "km별 페이스 탐색" })).not.toHaveTextContent("가장 빠름");
  });

  it("센서 비공개·결측을 추정으로 채우지 않고 케이던스 해설은 정의만 보여준다", () => {
    state.language = "en";
    state.metrics = gpsOnlyRunMetrics();
    Object.assign(state.metrics.metrics!, { avgSpeedKph: null, avgCadence: null, avgPower: null, avgHr: null, cadenceUnit: "spm", splits: [{ km: 1, paceSec: 337, gapSec: null, avgHr: null, avgCadence: 191 }] });
    renderRun();
    const selected = screen.getByTestId("selected-run-split");
    expect(selected).not.toHaveTextContent(/bpm|W|Grade-adjusted/);
    expect(screen.queryByText("Running power")).not.toBeInTheDocument();
    fireEvent.click(within(selected).getByRole("button", { name: /Cadence — Show metric explanation/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent(enGlossary.cadence.definition);
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/170|185|optimal|target/);
  });

  it.each(["ko", "en"] as const)("러닝 심박 존 제목이 번역 키 대신 현지화된 제목으로 보인다 locale=%s", language => {
    state.language = language;
    state.metrics = gpsOnlyRunMetrics();
    Object.assign(state.metrics.metrics!, { avgHr: 150, maxHr: 172, hrZoneSec: [0, 0, 100, 200, 0] });
    const { container } = renderRun();
    const resource = language === "ko" ? koActivity : enActivity;
    expect(screen.getByText(resource.analysis.zones.hr)).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/analysis\.|runCards\.|stat\./);
  });

  it("페이스 단위는 마일 설정을 따르되 스플릿은 원래 1km 단위다", () => {
    state.units = "imperial";
    state.metrics = gpsOnlyRunMetrics();
    renderRun();
    expect(screen.getByText("6:25/mi")).toBeInTheDocument();
    expect(screen.getAllByText("analysis.run.splitsUnits").length).toBeGreaterThan(0);
  });
  it("부분 공유 스플릿에서 고도가 빠져도 페이스를 보존한다", () => {
    state.metrics = gpsOnlyRunMetrics();
    Object.assign(state.metrics.metrics!, { splits: [{ km: 1, paceSec: 337, gapSec: null }] });
    renderRun();
    expect(within(screen.getByTestId("selected-run-split")).getByText("5:37/km")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
  it("이전 분석과 업로드 중인 입력은 수치와 함께 표시한다", () => {
    state.metrics = { ...gpsOnlyRunMetrics(), status: "stale" } as UseActivityMetricsState;
    Object.assign(state.metrics.metrics!, { inputPending: true, computedAt: 1000, version: 33 });
    renderRun();
    expect(screen.getByText("serverMetrics.staleChip")).toBeInTheDocument();
    expect(screen.getByText("serverMetrics.provisionalChip")).toBeInTheDocument();
  });

  it("러닝 파워를 FTP·NP·페달 분석과 분리한다", () => {
    state.metrics = gpsOnlyRunMetrics();
    Object.assign(state.metrics.metrics!, { avgPower: 264, np: 290, if: 1.2, vi: 1.1, avgHr: 150, avgCadence: 88.8, cadenceUnit: "strides_per_minute", contextSnapshot: { ftp: null }, quadrant: { q1Pct: 20 }, cyclingDynamics: {} });
    renderRun();
    expect(screen.getByText("stat.runningPower")).toBeInTheDocument();
    expect(screen.getByText(/178 spm/)).toBeInTheDocument();
    for (const label of ["NP", "IF", "VI", "overviewEvidence.ftpMissing", "analysis.section.pedalQuality", "analysis.metric.ef", "analysis.metric.decoupling"]) expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it("공개 정본 모드에도 러닝 스플릿을 보존한다", () => {
    state.metrics = gpsOnlyRunMetrics();
    render(<AnalysisTab activityId="public-run" sport="run" canonicalPresentationAvailable streams={{ time: [], distance: [] } as unknown as ActivityStreams} />);
    expect(screen.getAllByText("analysis.section.splits").length).toBeGreaterThan(0);
    expect(screen.getByText("3:59/km")).toBeInTheDocument();
  });

  it("파워·심박이 없어도 러닝 분석을 막지 않는다", () => {
    state.metrics = gpsOnlyRunMetrics();
    renderRun();
    // 이 문구가 뜨면 아래 러닝 섹션 전체가 조기 종료로 unreachable 이다.
    expect(screen.queryByText("analysis.empty.noStreamsTitle")).not.toBeInTheDocument();
    expect(screen.getAllByText("analysis.section.splits").length).toBeGreaterThan(0);
  });

  it("서버 러닝 지표를 카드로 노출한다", () => {
    state.metrics = gpsOnlyRunMetrics();
    renderRun();
    expect(screen.getByText("analysis.metric.fastestKm")).toBeInTheDocument();
    expect(screen.getByText("analysis.metric.paceConsistency")).toBeInTheDocument();
  });

  it("공개 스플릿 누락을 센서 스트림 없음으로 오인하지 않는다", () => {
    state.metrics = {
      status: "ready",
      metrics: { discipline: "run", distanceKm: 5, durationSec: 1800, avgPower: null, avgHr: null, splits: [], runMetrics: {} },
    } as unknown as UseActivityMetricsState;
    renderRun();
    expect(screen.queryByText("analysis.empty.noStreamsTitle")).not.toBeInTheDocument();
    expect(screen.getByText("analysis.run.splitsUnavailable")).toBeInTheDocument();
  });
});
