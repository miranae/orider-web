import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import koActivity from "../i18n/resources/ko/activity.json";
import enActivity from "../i18n/resources/en/activity.json";
import type { ActivityStreams } from "@shared/types";
import type { UseActivityMetricsState } from "../hooks/useActivityMetrics";

const state = vi.hoisted(() => ({ metrics: {} as UseActivityMetricsState, units: "metric" as "metric" | "imperial", language: null as "ko" | "en" | null }));
vi.mock("../hooks/useActivityMetrics", () => ({ useActivityMetrics: () => state.metrics }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => {
  if (!state.language) return key;
  const resource: unknown = state.language === "ko" ? koActivity : enActivity;
  const value = key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, resource);
  return typeof value === "string" ? value : key;
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
    expect(screen.getByText("analysis.run.splitsUnits")).toBeInTheDocument();
  });
  it("부분 공유 스플릿에서 고도가 빠져도 페이스를 보존한다", () => {
    state.metrics = gpsOnlyRunMetrics();
    Object.assign(state.metrics.metrics!, { splits: [{ km: 1, paceSec: 337, gapSec: null }] });
    renderRun();
    expect(screen.getByText("5:37/km")).toBeInTheDocument();
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
    expect(screen.getByText("analysis.section.splits")).toBeInTheDocument();
    expect(screen.getByText("3:59/km")).toBeInTheDocument();
  });

  it("파워·심박이 없어도 러닝 분석을 막지 않는다", () => {
    state.metrics = gpsOnlyRunMetrics();
    renderRun();
    // 이 문구가 뜨면 아래 러닝 섹션 전체가 조기 종료로 unreachable 이다.
    expect(screen.queryByText("analysis.empty.noStreamsTitle")).not.toBeInTheDocument();
    expect(screen.getByText("analysis.section.splits")).toBeInTheDocument();
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
