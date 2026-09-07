import { render, screen } from "@testing-library/react";
import type { TFunction } from "i18next";
import type { ActivitySummary } from "@shared/types";
import { ActivityStatsGrid } from "./ActivityStatsGrid";
import { resolveSummaryStripStats } from "./summaryStripStats";
import type { ActivityMetricsDoc, UseActivityMetricsState } from "../../../hooks/useActivityMetrics";

const labels: Record<string, string> = {
  "stat.distance": "거리",
  "stat.movingTime": "이동 시간",
  "stat.elapsedTime": "경과 시간",
  "stat.avgPace": "평균 페이스",
  "stat.maxPace": "최고 페이스",
  "stat.elev": "획득 고도",
  "stat.elevLoss": "하강",
  "stat.avgHr": "평균 심박수",
  "stat.avgPower": "평균 파워",
  "stat.cadence": "케이던스",
  "stat.runLoad": "러닝 부하",
  "stat.calories": "칼로리",
  "stat.deviceSummary": "기기 요약",
  "page.max": "최대",
};

const t = ((key: string) => labels[key] ?? key) as TFunction<"activity">;

const runningSummary: ActivitySummary = {
  distance: 18_400,
  ridingTimeMillis: 7_200_000,
  averageSpeed: 12,
  maxSpeed: 18,
  averageCadence: 178,
  maxCadence: 190,
  averageHeartRate: 158,
  maxHeartRate: 181,
  averagePower: 310,
  maxPower: 640,
  normalizedPower: 325,
  elevationGain: 240,
  calories: 2_220,
  relativeEffort: 120,
  tss: 92,
  swolf: null,
};

const missingState: UseActivityMetricsState = { status: "missing", metrics: null };

function readyState(overrides: Partial<ActivityMetricsDoc>): UseActivityMetricsState {
  return {
    status: "ready",
    metrics: {
      distanceKm: 20,
      avgSpeedKph: 10,
      maxSpeedKph: 15,
      elevationGainM: 300,
      elevationLossM: 280,
      caloriesKcal: 2_000,
      avgHr: 150,
      maxHr: 175,
      avgCadence: 170,
      avgPower: 300,
      maxPower: 600,
      np: 320,
      movingTimeSec: 6_660,
      pauseTimeSec: 540,
      ...overrides,
    } as ActivityMetricsDoc,
  };
}

function statsFor(state: UseActivityMetricsState) {
  return resolveSummaryStripStats(state, {
    summary: runningSummary,
    avgPowerValue: 310,
    avgSpeedFallbackKph: 12,
    normalizedPowerValue: 325,
    hasStreamPowerCandidate: false,
  });
}

function renderGrid(state: UseActivityMetricsState, extra?: { showElevation?: boolean; summary?: ActivitySummary }) {
  return render(
    <ActivityStatsGrid
      summary={extra?.summary ?? runningSummary}
      stats={statsFor(state)}
      sport="run"
      movingTimeSec={6_660}
      pauseTimeSec={540}
      elapsedTimeMillis={7_200_000}
      displayAvgKph={12}
      displayAvgImplausible={false}
      avgSpeedImplausible={false}
      maxSpeedImplausible={false}
      showElevation={extra?.showElevation ?? true}
      distVal={(meters) => (meters / 1_000).toFixed(1)}
      distUnit="km"
      speedVal={(kph) => kph.toFixed(1)}
      speedUnit="km/h"
      elevVal={(meters) => Math.round(meters)}
      elevUnit="m"
      t={t}
    />,
  );
}

function cellTexts() {
  return Array.from(screen.getByTestId("activity-stats-grid").children).map((cell) => cell.textContent);
}

describe("ActivityStatsGrid", () => {
  it("서버 분석 문서가 없으면 기기 요약값을 보여주되 '기기 요약' 으로 표식한다", () => {
    renderGrid(missingState);

    expect(cellTexts()).toEqual([
      "거리18.4km기기 요약",
      "이동 시간1h 51m",
      "평균 페이스5'00\"/km기기 요약",
      "최고 페이스3'20\"/km기기 요약",
      "획득 고도240m기기 요약",
      "평균 심박수158bpm최대 181기기 요약",
      "평균 파워310WNP 325기기 요약",
      "케이던스178spm기기 요약",
      "러닝 부하92",
      "칼로리2,220kcal기기 요약",
    ]);
  });

  it("서버 분석 문서가 있으면 서버 값이 정본이고 잠정 표식이 없다", () => {
    renderGrid(readyState({}));

    expect(cellTexts()).toEqual([
      "거리20.0km",
      "이동 시간1h 51m",
      "평균 페이스6'00\"/km",
      "최고 페이스4'00\"/km",
      "획득 고도300m하강 280m",
      "평균 심박수150bpm최대 175",
      "평균 파워300WNP 320",
      "케이던스170spm",
      "러닝 부하92",
      "칼로리2,000kcal",
    ]);
    expect(screen.queryByTestId("stat-provisional")).not.toBeInTheDocument();
  });

  it("서버가 null 이라고 답한 필드는 대시/생략 — 기기 요약으로 조용히 메우지 않는다", () => {
    renderGrid(readyState({ avgHr: null, maxHr: null, avgCadence: null, avgSpeedKph: null }));

    const texts = cellTexts().join("|");
    expect(texts).toContain("평균 페이스--");
    expect(texts).not.toContain("158");
    expect(texts).not.toContain("178spm");
  });

  it("NP 보조줄은 서버 np 단일 출처 — 요약의 normalizedPower 로 대체하지 않는다", () => {
    renderGrid(readyState({ np: null }));

    const power = cellTexts().find((text) => text?.startsWith("평균 파워"));
    expect(power).toBe("평균 파워300W");
  });

  it("서버 상승이 null 이어도 하강이 있으면 칸을 내고 상승은 대시로 — 하강을 묻지 않는다", () => {
    renderGrid(readyState({ elevationGainM: null, elevationLossM: 280 }));

    const elev = cellTexts().find((text) => text?.startsWith("획득 고도"));
    expect(elev).toBe("획득 고도--하강 280m");
  });

  it("상승·하강이 모두 null 이면 고도 칸 자체를 내지 않는다", () => {
    renderGrid(readyState({ elevationGainM: null, elevationLossM: null }));

    expect(cellTexts().some((text) => text?.startsWith("획득 고도"))).toBe(false);
  });

  it("uses two columns on mobile and delays six columns until extra-wide screens", () => {
    renderGrid(missingState, {
      showElevation: false,
      summary: { ...runningSummary, averageHeartRate: null, averageCadence: null, tss: null, calories: null },
    });

    expect(screen.getByTestId("activity-stats-grid")).toHaveClass(
      "grid-cols-2",
      "sm:grid-cols-3",
      "xl:grid-cols-6",
    );
  });
});
