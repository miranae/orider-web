import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LifetimeMilestonesGrid from "./LifetimeMilestonesGrid";
import type { Milestone, MilestoneId } from "@shared/types/milestone";
import type { LifetimeTotals } from "../../utils/lifetimeMilestones";

function achieved(...ids: MilestoneId[]): Map<MilestoneId, Milestone> {
  const m = new Map<MilestoneId, Milestone>();
  for (const id of ids) {
    m.set(id, {
      id,
      kind: "cumulative",
      achievedAt: Date.parse("2026-07-10T00:00:00Z"),
      activityId: "a1",
      celebrated: true,
      createdAt: 0,
    });
  }
  return m;
}

const totals: LifetimeTotals = {
  totalDistanceMeters: 640_000,
  longestRide: { activityId: "a1", distanceMeters: 123_400, startTime: 0, type: "Ride" },
};

describe("LifetimeMilestonesGrid", () => {
  it("서버 누적 마일스톤 카탈로그 3종을 표시한다", () => {
    render(<LifetimeMilestonesGrid achieved={achieved()} totals={totals} />);
    expect(screen.getByText("100km")).toBeInTheDocument();
    expect(screen.getByText("500km")).toBeInTheDocument();
    expect(screen.getByText("1,000km")).toBeInTheDocument();
  });

  it("서버가 달성으로 판정한 배지만 달성일을 보여준다", () => {
    render(<LifetimeMilestonesGrid achieved={achieved("cumulative_100km")} totals={totals} />);
    expect(screen.getByText("2026.7.10")).toBeInTheDocument();
    expect(screen.getAllByText("2026.7.10")).toHaveLength(1);
  });

  it("구독 응답 전에는 배지를 그리지 않는다 — 모름을 미달성으로 그리지 않기 위해", () => {
    render(<LifetimeMilestonesGrid achieved={achieved()} totals={totals} loading />);
    expect(screen.getByTestId("lifetime-milestones-loading")).toBeInTheDocument();
    expect(screen.queryByText("100km")).not.toBeInTheDocument();
  });

  it("누적 합계·최장 라이드는 서버 대응 필드가 없어 화면 집계값을 쓴다", () => {
    render(<LifetimeMilestonesGrid achieved={achieved()} totals={totals} />);
    expect(screen.getByText("누적 640km (모든 종목)")).toBeInTheDocument();
    expect(screen.getByText("123.4 km")).toBeInTheDocument();
  });
});
