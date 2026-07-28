import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ServerMetricsBanner from "./ServerMetricsBanner";

const readyState = {
  status: "ready",
  metrics: {
    tss: 444,
    np: 333,
    if: 0.91,
    vi: 1.08,
    trimp: 72,
    workoutType: "endurance",
    workoutTypeConfidence: 0.9,
    movingTimeSec: 3_600,
    pauseTimeSec: 120,
    computedAt: 1_700_000_000_000,
    version: 1,
  },
} as const;

describe("ServerMetricsBanner power provenance", () => {
  it.each(["explicit", "legacy", "rejected"])(
    "hides revisionless NP/TSS for a %s stream power candidate",
    () => {
      render(<ServerMetricsBanner state={readyState as never} suppressPowerMetrics />);

      expect(screen.queryByText("333 W")).not.toBeInTheDocument();
      expect(screen.queryByText("444")).not.toBeInTheDocument();
      expect(screen.getByText("IF")).toBeInTheDocument();
      expect(screen.getByText("VI")).toBeInTheDocument();
      expect(screen.getByText("지구력")).toBeInTheDocument();
      expect(screen.getByText("분석상 이동시간")).toBeInTheDocument();
    },
  );

  it("keeps server NP/TSS when the activity has no stream power candidate", () => {
    render(<ServerMetricsBanner state={readyState as never} />);

    expect(screen.getByText("333 W")).toBeInTheDocument();
    expect(screen.getByText("444")).toBeInTheDocument();
    expect(screen.getByText("지구력")).toBeInTheDocument();
  });
});
