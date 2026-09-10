import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AnalysisTab from "./AnalysisTab";

const mocks = vi.hoisted(() => ({
  useActivityMetrics: vi.fn(),
}));

vi.mock("../hooks/useActivityMetrics", async (importOriginal) => {
  const original = await importOriginal<typeof import("../hooks/useActivityMetrics")>();
  return { ...original, useActivityMetrics: mocks.useActivityMetrics };
});

vi.mock("../hooks/useFitnessTimeseries", () => ({
  useFitnessTimeseries: () => ({ timeseries: null }),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ profile: null, user: { uid: "viewer" } }),
}));

vi.mock("../contexts/LocaleContext", () => ({
  useLocale: () => ({ units: "metric", locale: "ko-KR" }),
}));

vi.mock("./ZoneDistributionChart", () => ({ default: () => null }));
vi.mock("./PowerCurveChart", () => ({ default: () => null }));

describe("AnalysisTab public metrics", () => {
  it("비소유자의 공개 파워·심박·사이클링 다이내믹스를 빈 상태로 조기 반환하지 않고 그린다", () => {
    mocks.useActivityMetrics.mockReturnValue({
      status: "ready",
      metrics: {
        version: 1,
        np: 240,
        avgPower: 220,
        avgHr: 148,
        cyclingDynamics: {
          source: "records",
          sampleCount: 10,
          validSampleCount: 9,
          coverage: 0.9,
          balance: { leftAvgPct: 49, rightAvgPct: 51, asymmetryPct: 2 },
        },
      },
    });

    render(<AnalysisTab activityId="public-activity" isOwner={false} streams={{}} sport="ride" />);

    expect(mocks.useActivityMetrics).toHaveBeenCalledWith("public-activity", false);
    expect(screen.queryByTestId("analysis-missing")).not.toBeInTheDocument();
    expect(screen.getByText("파워 분석")).toBeInTheDocument();
    expect(screen.getByText("심박 분석")).toBeInTheDocument();
    expect(screen.getByText("사이클링 다이내믹스")).toBeInTheDocument();
    expect(screen.getByText("220")).toBeInTheDocument();
    expect(screen.getByText("240")).toBeInTheDocument();
    expect(screen.getByText("148")).toBeInTheDocument();
    expect(screen.getByText("49.0 / 51.0")).toBeInTheDocument();
  });
});
