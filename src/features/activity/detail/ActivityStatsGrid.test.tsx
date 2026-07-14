import { render, screen } from "@testing-library/react";
import type { TFunction } from "i18next";
import type { ActivitySummary } from "@shared/types";
import { ActivityStatsGrid } from "./ActivityStatsGrid";

const labels: Record<string, string> = {
  "stat.distance": "거리",
  "stat.movingTime": "이동 시간",
  "stat.elapsedTime": "경과 시간",
  "stat.avgPace": "평균 페이스",
  "stat.maxPace": "최고 페이스",
  "stat.elev": "획득 고도",
  "stat.avgHr": "평균 심박수",
  "stat.avgPower": "평균 파워",
  "stat.cadence": "케이던스",
  "stat.runLoad": "러닝 부하",
  "stat.calories": "칼로리",
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

describe("ActivityStatsGrid", () => {
  it("renders all running metrics in one stable, meaningful order", () => {
    render(
      <ActivityStatsGrid
        summary={runningSummary}
        sport="run"
        avgPowerValue={310}
        normalizedPowerValue={325}
        movingTimeSec={6_660}
        pauseTimeSec={540}
        elapsedTimeMillis={7_200_000}
        displayAvgKph={12}
        displayAvgImplausible={false}
        avgSpeedImplausible={false}
        maxSpeedImplausible={false}
        showElevation
        distVal={(meters) => (meters / 1_000).toFixed(1)}
        distUnit="km"
        speedVal={(kph) => kph.toFixed(1)}
        speedUnit="km/h"
        elevVal={(meters) => Math.round(meters)}
        elevUnit="m"
        t={t}
      />,
    );

    const cells = Array.from(screen.getByTestId("activity-stats-grid").children);
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "거리18.4km",
      "이동 시간1h 51m",
      "평균 페이스5'00\"/km",
      "최고 페이스3'20\"/km",
      "획득 고도240m",
      "평균 심박수158bpm최대 181",
      "평균 파워310WNP 325",
      "케이던스178spm",
      "러닝 부하92",
      "칼로리2,220kcal",
    ]);
  });

  it("uses two columns on mobile and delays six columns until extra-wide screens", () => {
    render(
      <ActivityStatsGrid
        summary={{ ...runningSummary, averageHeartRate: null, averageCadence: null, tss: null, calories: null }}
        sport="run"
        avgPowerValue={null}
        normalizedPowerValue={null}
        displayAvgKph={12}
        displayAvgImplausible={false}
        avgSpeedImplausible={false}
        maxSpeedImplausible={false}
        showElevation={false}
        distVal={(meters) => (meters / 1_000).toFixed(1)}
        distUnit="km"
        speedVal={(kph) => kph.toFixed(1)}
        speedUnit="km/h"
        elevVal={(meters) => Math.round(meters)}
        elevUnit="m"
        t={t}
      />,
    );

    expect(screen.getByTestId("activity-stats-grid")).toHaveClass(
      "grid-cols-2",
      "sm:grid-cols-3",
      "xl:grid-cols-6",
    );
  });
});
