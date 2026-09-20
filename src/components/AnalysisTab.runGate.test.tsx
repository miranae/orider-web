import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityStreams } from "@shared/types";
import type { UseActivityMetricsState } from "../hooks/useActivityMetrics";

const state = vi.hoisted(() => ({ metrics: {} as UseActivityMetricsState }));
vi.mock("../hooks/useActivityMetrics", () => ({ useActivityMetrics: () => state.metrics }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../contexts/LocaleContext", () => ({ useLocale: () => ({ locale: "ko", units: "metric" }) }));

afterEach(cleanup);

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

  it("러닝 지표까지 없으면 빈 상태를 그대로 보여준다", () => {
    state.metrics = {
      status: "ready",
      metrics: { discipline: "run", distanceKm: 5, durationSec: 1800, avgPower: null, avgHr: null, splits: [], runMetrics: {} },
    } as unknown as UseActivityMetricsState;
    renderRun();
    expect(screen.getByText("analysis.empty.noStreamsTitle")).toBeInTheDocument();
  });
});
